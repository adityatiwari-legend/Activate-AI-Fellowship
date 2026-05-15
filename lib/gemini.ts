const SYSTEM_PROMPT = `You are an expert in conversational momentum analysis.

Your tasks:

1. Identify where conversational momentum collapsed
2. Explain why in one psychologically accurate sentence
3. Generate one realistic revival message

Rules:

* Avoid generic observations
* Avoid robotic phrasing
* Avoid sounding like a therapist
* Avoid manipulation
* Prioritize realism over cleverness
* Keep explanations concise
* The revival message must feel naturally sendable

Tone options:

* Casual → relaxed and low pressure
* Confident → direct and composed
* Playful → light and slightly unexpected

Return ONLY valid JSON:

{
"failure_point": "...",
"diagnosis": "...",
"revival_message": "..."
}`;

export type AnalysisTone = "Casual" | "Confident" | "Playful";
export type ConversationType =
  | "Sales"
  | "Networking"
  | "Client"
  | "Recruiting"
  | "Personal"
  | "Other";

export type AnalysisResult = {
  failure_point: string;
  diagnosis: string;
  revival_message: string;
};

class ModelError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status = 500, retryAfterSeconds?: number) {
    super(message);
    this.name = "ModelError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type GeminiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ "@type"?: string; retryDelay?: string }>;
  };
};

type ParsedApiError = {
  message: string;
  retryAfterSeconds?: number;
};

function parseGeminiErrorPayload(raw: string): ParsedApiError {
  try {
    const parsed = JSON.parse(raw) as GeminiErrorPayload;
    const message = parsed.error?.message?.trim();
    const retryInfo = parsed.error?.details?.find((detail) =>
      String(detail?.["@type"]).includes("RetryInfo")
    );
    let retryAfterSeconds: number | undefined;
    if (retryInfo?.retryDelay) {
      const match = retryInfo.retryDelay.match(/^(\d+)s$/);
      if (match) retryAfterSeconds = Number(match[1]);
    }
    return {
      message: message || raw.slice(0, 300),
      retryAfterSeconds
    };
  } catch {
    return { message: raw.slice(0, 300) };
  }
}

async function fetchAvailableGenerateModels(apiKey: string): Promise<string[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    models?: Array<{
      name?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  return (
    data.models
      ?.filter((model) =>
        model.supportedGenerationMethods?.includes("generateContent")
      )
      .map((model) => model.name?.replace(/^models\//, "").trim())
      .filter((model): model is string => Boolean(model)) ?? []
  );
}

function parseModelJson(content: string): AnalysisResult {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model did not return valid JSON.");
  }

  const rawJson = content.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(rawJson) as Partial<AnalysisResult>;

  if (
    typeof parsed.failure_point !== "string" ||
    typeof parsed.diagnosis !== "string" ||
    typeof parsed.revival_message !== "string"
  ) {
    throw new Error("Model response schema is invalid.");
  }

  return {
    failure_point: parsed.failure_point.trim(),
    diagnosis: parsed.diagnosis.trim(),
    revival_message: parsed.revival_message.trim()
  };
}

export async function analyzeConversation(input: {
  conversation: string;
  tone: AnalysisTone;
  conversationType: ConversationType;
}): Promise<AnalysisResult> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ModelError("Missing GOOGLE_GEMINI_API_KEY (or GEMINI_API_KEY).", 500);
  }

  const preferredModelCandidates = [
    process.env.GEMINI_MODEL?.trim(),
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite"
  ].filter(Boolean) as string[];

  const dedupedPreferredModels = Array.from(new Set(preferredModelCandidates));
  const availableModels = await fetchAvailableGenerateModels(apiKey);

  const modelsToTry =
    availableModels.length > 0
      ? dedupedPreferredModels.filter((model) => availableModels.includes(model))
      : dedupedPreferredModels;

  const dedupedModels =
    modelsToTry.length > 0
      ? modelsToTry
      : availableModels.length > 0
        ? [availableModels[0]]
        : dedupedPreferredModels;

  const trimmedConversation = input.conversation.slice(0, 10000);
  const userPrompt = `Conversation Type: ${input.conversationType}
Desired Tone: ${input.tone}

Conversation Thread:
${trimmedConversation}

Return only JSON with keys failure_point, diagnosis, revival_message.`;

  let lastError: unknown = null;
  for (const model of dedupedModels) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 1000,
            responseMimeType: "application/json"
          }
        }),
        cache: "no-store"
      }
    );

    if (!response.ok) {
      const details = await response.text();
      const { message: apiMessage, retryAfterSeconds } =
        parseGeminiErrorPayload(details);
      const lowerMessage = apiMessage.toLowerCase();

      const isQuotaError =
        response.status === 429 ||
        lowerMessage.includes("quota") ||
        lowerMessage.includes("resource_exhausted");
      const isModelNotFoundError =
        response.status === 404 &&
        (lowerMessage.includes("not found") || lowerMessage.includes("model"));
      const isLastModel = model === dedupedModels[dedupedModels.length - 1];

      if (isQuotaError && !isLastModel) {
        lastError = new ModelError(
          `Quota hit on ${model}. Trying fallback model...`,
          response.status,
          retryAfterSeconds
        );
        continue;
      }

      if (isModelNotFoundError && !isLastModel) {
        lastError = new ModelError(
          `Model ${model} is unavailable for this key. Trying fallback model...`,
          404
        );
        continue;
      }

      if (isQuotaError) {
        throw new ModelError(
          retryAfterSeconds
            ? `Gemini quota exceeded. Retry in about ${retryAfterSeconds}s, or enable billing / increase quota in Google AI Studio.`
            : "Gemini quota exceeded. Enable billing or increase quota in Google AI Studio.",
          429,
          retryAfterSeconds
        );
      }

      if (isModelNotFoundError) {
        throw new ModelError(
          `Gemini model not found/accessible for this key. Set GEMINI_MODEL to an available model like gemini-2.5-flash or gemini-2.0-flash.`,
          404
        );
      }

      throw new ModelError(
        `Gemini API request failed (${response.status}): ${apiMessage}`,
        response.status
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new ModelError("Gemini response was empty.", 502);
    }

    return parseModelJson(text);
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new ModelError("All Gemini model attempts failed.", 500);
}
