import "server-only";
import { prisma } from "../db";
import type { EmbeddingSourceType } from "../../generated/prisma/client";

export type EmbeddingSourceRef = { kbArticleId: string } | { commandId: string };

export async function getEmbeddingBySource(ref: EmbeddingSourceRef) {
  return prisma.contentEmbedding.findUnique({
    where: "kbArticleId" in ref ? { kbArticleId: ref.kbArticleId } : { commandId: ref.commandId },
    select: { id: true, contentHash: true },
  });
}

export async function upsertEmbedding(input: {
  sourceType: EmbeddingSourceType;
  kbArticleId?: string;
  commandId?: string;
  content: string;
  contentHash: string;
  embedding: number[];
  model: string;
  dimensions: number;
}) {
  const where = input.kbArticleId ? { kbArticleId: input.kbArticleId } : { commandId: input.commandId! };
  const data = {
    sourceType: input.sourceType,
    kbArticleId: input.kbArticleId,
    commandId: input.commandId,
    content: input.content,
    contentHash: input.contentHash,
    embedding: input.embedding,
    model: input.model,
    dimensions: input.dimensions,
  };
  return prisma.contentEmbedding.upsert({ where, create: data, update: data });
}

export async function deleteEmbeddingBySource(ref: EmbeddingSourceRef) {
  await prisma.contentEmbedding.deleteMany({
    where: "kbArticleId" in ref ? { kbArticleId: ref.kbArticleId } : { commandId: ref.commandId },
  });
}

/**
 * Every embedding whose source is still published and not soft-deleted.
 * This is the search candidate set - filtering happens here via the Prisma
 * relation, not by trusting the (possibly stale) embedding row alone, so an
 * archived/deleted source can never surface in results even if its
 * embedding row hasn't been cleaned up yet.
 */
export async function listSearchableEmbeddings() {
  return prisma.contentEmbedding.findMany({
    where: {
      OR: [
        { kbArticle: { status: "PUBLISHED", deletedAt: null } },
        { command: { status: "PUBLISHED", deletedAt: null } },
      ],
    },
    select: {
      embedding: true,
      kbArticle: { select: { id: true, title: true, summary: true } },
      command: { select: { id: true, title: true, description: true, commandText: true } },
    },
  });
}
