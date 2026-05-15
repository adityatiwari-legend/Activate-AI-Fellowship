"use client";

import * as React from "react";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const conversationTypes = [
  "Sales",
  "Networking",
  "Client",
  "Recruiting",
  "Personal",
  "Other"
] as const;

const tones = ["Casual", "Confident", "Playful"] as const;

type ConversationType = (typeof conversationTypes)[number];
type Tone = (typeof tones)[number];

type AnalysisResult = {
  failure_point: string;
  diagnosis: string;
  revival_message: string;
};

const loadingSteps = [
  "Detecting momentum shifts...",
  "Analyzing tone transitions...",
  "Identifying friction points..."
];

export function DeadThreadReviver() {
  const [conversation, setConversation] = React.useState("");
  const [conversationType, setConversationType] =
    React.useState<ConversationType>("Other");
  const [tone, setTone] = React.useState<Tone>("Casual");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AnalysisResult | null>(null);
  const [loadingIndex, setLoadingIndex] = React.useState(0);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingIndex((prev) => (prev + 1) % loadingSteps.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [isLoading]);

  const runAnalysis = React.useCallback(async () => {
    setError(null);
    setCopied(false);

    if (!conversation.trim()) {
      setError("Paste a conversation thread to analyze.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversation, conversationType, tone })
      });

      const data = (await response.json()) as AnalysisResult & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Analysis failed.");
      }

      setResult({
        failure_point: data.failure_point,
        diagnosis: data.diagnosis,
        revival_message: data.revival_message
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [conversation, conversationType, tone]);

  const handleCopy = React.useCallback(async () => {
    if (!result?.revival_message) return;
    await navigator.clipboard.writeText(result.revival_message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:py-14">
      <section className="mb-8 space-y-3 text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Conversations usually don&apos;t die randomly.
        </h1>
        <p className="mx-auto max-w-2xl text-balance text-sm text-muted-foreground sm:text-base">
          Paste a dead thread. Find where momentum dropped. Get one message to
          revive it.
        </p>
      </section>

      <Card className="border-border/80 bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg">Paste → Analyze → Revive</CardTitle>
          <CardDescription>
            Keep it raw. Include both sides of the thread for better insight.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Textarea
            value={conversation}
            onChange={(event) => setConversation(event.target.value)}
            placeholder="Paste your conversation here — WhatsApp, email, LinkedIn, DM, anything..."
            className="min-h-[220px] resize-y"
          />

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Conversation Type (optional)
            </p>
            <div className="flex flex-wrap gap-2">
              {conversationTypes.map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={conversationType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setConversationType(type)}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tone
            </p>
            <Tabs
              value={tone}
              onValueChange={(value) => setTone(value as Tone)}
              className="w-full"
            >
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted/60 p-1">
                {tones.map((toneOption) => (
                  <TabsTrigger
                    key={toneOption}
                    value={toneOption}
                    className="py-2 data-[state=active]:shadow-none"
                  >
                    {toneOption}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <Button
            type="button"
            onClick={runAnalysis}
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? "Analyzing..." : "Analyze Conversation"}
          </Button>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </CardContent>
      </Card>

      {isLoading ? (
        <section className="mt-8 space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/60 p-4">
            <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <p className="text-sm text-muted-foreground">{loadingSteps[loadingIndex]}</p>
          </div>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-36 w-full" />
        </section>
      ) : null}

      {result ? (
        <section className="mt-8 space-y-4">
          <Card className="border-primary/35">
            <CardHeader>
              <CardTitle>Where momentum dropped</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">
                {result.failure_point}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Why it died</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{result.diagnosis}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send this</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="rounded-md border border-border/80 bg-muted/30 p-4 text-sm leading-relaxed">
                {result.revival_message}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopy}
                  disabled={isLoading}
                >
                  <Copy />
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={runAnalysis}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn(isLoading && "animate-spin")} />
                  Regenerate
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </main>
  );
}
