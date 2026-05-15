import { NextResponse } from "next/server";
import {
  analyzeConversation,
  type AnalysisTone,
  type ConversationType
} from "@/lib/gemini";

type AnalyzeRequestBody = {
  conversation?: string;
  tone?: AnalysisTone;
  conversationType?: ConversationType;
};

const VALID_TONES: AnalysisTone[] = ["Casual", "Confident", "Playful"];
const VALID_TYPES: ConversationType[] = [
  "Sales",
  "Networking",
  "Client",
  "Recruiting",
  "Personal",
  "Other"
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequestBody;

    const conversation = body.conversation?.trim() ?? "";
    const tone = body.tone ?? "Casual";
    const conversationType = body.conversationType ?? "Other";

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation text is required." },
        { status: 400 }
      );
    }

    if (!VALID_TONES.includes(tone)) {
      return NextResponse.json({ error: "Invalid tone." }, { status: 400 });
    }

    if (!VALID_TYPES.includes(conversationType)) {
      return NextResponse.json(
        { error: "Invalid conversation type." },
        { status: 400 }
      );
    }

    const analysis = await analyzeConversation({
      conversation,
      tone,
      conversationType
    });

    return NextResponse.json(analysis);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze conversation.";
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? ((error as { status: number }).status ?? 500)
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
