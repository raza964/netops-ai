import "server-only";
import { z } from "zod";
import { env } from "../env";

/**
 * Provider-agnostic embedding interface. lib/embeddings/indexer.ts and
 * search.ts depend only on this, not on Voyage specifically - swapping
 * providers (or adding a pgvector-backed variant that also handles storage)
 * means implementing this interface, not touching the callers.
 */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  /** Embeds a piece of source content that will be indexed for retrieval. */
  embedDocument(text: string): Promise<number[]>;
  /** Embeds a user's search query. Voyage recommends a distinct input_type for this. */
  embedQuery(text: string): Promise<number[]>;
}

export class EmbeddingProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingProviderError";
  }
}

const VOYAGE_MODEL = "voyage-4-lite";
const VOYAGE_DIMENSIONS = 1024;
const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const REQUEST_TIMEOUT_MS = 15_000;

const voyageResponseSchema = z.object({
  data: z
    .array(
      z.object({
        embedding: z.array(z.number()),
        index: z.number(),
      }),
    )
    .min(1),
});

type VoyageInputType = "document" | "query";

async function callVoyage(text: string, inputType: VoyageInputType): Promise<number[]> {
  if (!env.VOYAGE_API_KEY) {
    throw new EmbeddingProviderError(
      "VOYAGE_API_KEY is not configured. Semantic search and indexing are unavailable until it is set.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(VOYAGE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [text],
        model: VOYAGE_MODEL,
        input_type: inputType,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new EmbeddingProviderError(`Voyage AI request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new EmbeddingProviderError(`Voyage AI request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new EmbeddingProviderError(`Voyage AI returned ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new EmbeddingProviderError("Voyage AI returned a response body that was not valid JSON.");
  }

  const parsed = voyageResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new EmbeddingProviderError("Voyage AI response did not match the expected shape.");
  }

  const embedding = parsed.data.data[0]?.embedding;
  if (!embedding || embedding.length !== VOYAGE_DIMENSIONS) {
    throw new EmbeddingProviderError(
      `Voyage AI returned a vector of length ${embedding?.length ?? 0}, expected ${VOYAGE_DIMENSIONS}.`,
    );
  }

  return embedding;
}

export const voyageEmbeddingProvider: EmbeddingProvider = {
  model: VOYAGE_MODEL,
  dimensions: VOYAGE_DIMENSIONS,
  embedDocument: (text) => callVoyage(text, "document"),
  embedQuery: (text) => callVoyage(text, "query"),
};
