import "server-only";
import { z } from "zod";
import { env } from "../env";

export type TroubleshootingAnalysis = {
  analysis: string;
  recommendedNextStep: string;
};

export interface TroubleshootingProvider {
  readonly model: string;
  analyze(prompt: string): Promise<TroubleshootingAnalysis>;
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

const responseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).min(1),
});

const analysisSchema = z.object({
  analysis: z.string().trim().min(1).max(8000),
  recommendedNextStep: z.string().trim().min(1).max(4000),
});

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 30_000;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    throw new AiProviderError("The AI response was not valid JSON.");
  }
}

async function callAnthropic(prompt: string): Promise<TroubleshootingAnalysis> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AiProviderError("ANTHROPIC_API_KEY is not configured. AI case analysis is unavailable.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 1800,
        temperature: 0.2,
        system:
          "You are a cautious senior network engineer. Analyze only the supplied evidence. " +
          "Never claim a command was executed. Never recommend a configuration change without explicitly identifying it as requiring human review and approval. " +
          'Return JSON only: {"analysis":"...","recommendedNextStep":"..."}.',
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiProviderError(`Anthropic request timed out after ${TIMEOUT_MS}ms.`);
    }
    throw new AiProviderError(`Anthropic request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AiProviderError(`Anthropic returned ${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }

  const payload = responseSchema.safeParse(await response.json().catch(() => null));
  if (!payload.success) {
    throw new AiProviderError("Anthropic returned an unexpected response shape.");
  }

  const text = payload.data.content.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new AiProviderError("Anthropic returned no text content.");
  }

  const parsed = analysisSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new AiProviderError("The AI response did not contain a valid analysis and recommendation.");
  }
  return parsed.data;
}

export const anthropicTroubleshootingProvider: TroubleshootingProvider = {
  model: env.ANTHROPIC_MODEL,
  analyze: callAnthropic,
};
