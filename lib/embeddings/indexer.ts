import "server-only";
import crypto from "node:crypto";
import { prisma } from "../db";
import { deleteEmbeddingBySource, getEmbeddingBySource, upsertEmbedding } from "../data/embeddings";
import { voyageEmbeddingProvider, type EmbeddingProvider } from "./provider";

export type IndexResult =
  | { indexed: true }
  | { indexed: false; reason: "not-eligible" | "unchanged" };

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function buildArticleContent(article: { title: string; summary: string; content: string }): string {
  return [article.title, article.summary, article.content].filter(Boolean).join("\n\n");
}

function buildCommandContent(command: {
  title: string;
  commandText: string;
  description: string;
  purpose: string | null;
}): string {
  return [command.title, command.commandText, command.description, command.purpose].filter(Boolean).join("\n\n");
}

/**
 * Re-indexes a single KB article. Only PUBLISHED, non-deleted articles are
 * searchable, so anything else has its embedding removed instead. Skips the
 * embedding API call entirely when the composed content hasn't changed since
 * the last index (see contentHash on ContentEmbedding).
 *
 * Throws EmbeddingProviderError on a provider failure - callers (server
 * actions) decide whether that should block the underlying mutation; this
 * function's job is only to index or explain why it didn't.
 */
export async function indexKbArticle(
  articleId: string,
  provider: EmbeddingProvider = voyageEmbeddingProvider,
): Promise<IndexResult> {
  const article = await prisma.knowledgeBaseArticle.findUnique({
    where: { id: articleId },
    select: { title: true, summary: true, content: true, status: true, deletedAt: true },
  });

  if (!article || article.deletedAt || article.status !== "PUBLISHED") {
    await deleteEmbeddingBySource({ kbArticleId: articleId });
    return { indexed: false, reason: "not-eligible" };
  }

  const content = buildArticleContent(article);
  const contentHash = hashContent(content);
  const existing = await getEmbeddingBySource({ kbArticleId: articleId });
  if (existing && existing.contentHash === contentHash) {
    return { indexed: false, reason: "unchanged" };
  }

  const embedding = await provider.embedDocument(content);
  await upsertEmbedding({
    sourceType: "KB_ARTICLE",
    kbArticleId: articleId,
    content,
    contentHash,
    embedding,
    model: provider.model,
    dimensions: provider.dimensions,
  });
  return { indexed: true };
}

/** Mirrors indexKbArticle for CommandCatalogEntry. */
export async function indexCommand(
  commandId: string,
  provider: EmbeddingProvider = voyageEmbeddingProvider,
): Promise<IndexResult> {
  const command = await prisma.commandCatalogEntry.findUnique({
    where: { id: commandId },
    select: { title: true, commandText: true, description: true, purpose: true, status: true, deletedAt: true },
  });

  if (!command || command.deletedAt || command.status !== "PUBLISHED") {
    await deleteEmbeddingBySource({ commandId });
    return { indexed: false, reason: "not-eligible" };
  }

  const content = buildCommandContent(command);
  const contentHash = hashContent(content);
  const existing = await getEmbeddingBySource({ commandId });
  if (existing && existing.contentHash === contentHash) {
    return { indexed: false, reason: "unchanged" };
  }

  const embedding = await provider.embedDocument(content);
  await upsertEmbedding({
    sourceType: "COMMAND_CATALOG_ENTRY",
    commandId,
    content,
    contentHash,
    embedding,
    model: provider.model,
    dimensions: provider.dimensions,
  });
  return { indexed: true };
}

export async function removeArticleEmbedding(articleId: string) {
  await deleteEmbeddingBySource({ kbArticleId: articleId });
}

export async function removeCommandEmbedding(commandId: string) {
  await deleteEmbeddingBySource({ commandId });
}
