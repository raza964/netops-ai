import "server-only";
import { listSearchableEmbeddings } from "../data/embeddings";
import { cosineSimilarity } from "./similarity";
import { voyageEmbeddingProvider, type EmbeddingProvider } from "./provider";
import type { EmbeddingSourceType } from "../../generated/prisma/client";

export type SemanticSearchResult = {
  score: number;
  sourceType: "KB_ARTICLE" | "COMMAND_CATALOG_ENTRY";
  id: string;
  title: string;
  snippet: string;
};

/**
 * Embeds the query and ranks it against every published, non-deleted
 * embedding by cosine similarity, in application code (no pgvector index
 * available - see the ContentEmbedding schema comment). Swapping in a
 * pgvector-backed ORDER BY ... LIMIT query later only means replacing the
 * body of this function; the signature and result shape can stay the same.
 */
export async function semanticSearch(
  query: string,
  options: { limit?: number; provider?: EmbeddingProvider; sourceType?: EmbeddingSourceType } = {},
): Promise<SemanticSearchResult[]> {
  const provider = options.provider ?? voyageEmbeddingProvider;
  const limit = options.limit ?? 10;

  const [queryVector, candidates] = await Promise.all([
    provider.embedQuery(query),
    listSearchableEmbeddings(options.sourceType),
  ]);

  const results: SemanticSearchResult[] = candidates.map((row) => {
    const isArticle = row.kbArticle !== null;
    const source = isArticle ? row.kbArticle! : row.command!;
    return {
      score: cosineSimilarity(queryVector, row.embedding),
      sourceType: isArticle ? "KB_ARTICLE" : "COMMAND_CATALOG_ENTRY",
      id: source.id,
      title: source.title,
      snippet: isArticle ? row.kbArticle!.summary : row.command!.description,
    };
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
