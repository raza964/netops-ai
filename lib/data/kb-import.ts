import "server-only";
import { prisma } from "../db";
import { slugify } from "../slug";
import type { KbImportBatch } from "../validation/kb-import";

export type ImportResult = {
  created: number;
  updated: number;
  failed: Array<{ name: string; error: string }>;
};

function articleSlug(name: string, sha256: string): string {
  const base = slugify(name.replace(/\.md$/i, "")) || "imported-article";
  return `source-${base.slice(0, 80)}-${sha256.slice(0, 16)}`;
}

function articleSummary(file: KbImportBatch["files"][number], collection: KbImportBatch["collection"]): string {
  const label = collection === "RESTRICTED_OPERATIONS" ? "Restricted operational source" : "Imported source";
  return `${label}: ${file.category}. Sensitivity: ${file.sensitivity.toLowerCase()}. Review required before publication.`;
}

function articleContent(file: KbImportBatch["files"][number], collection: KbImportBatch["collection"]): string {
  return [
    "<!-- NETOPS_AI_SOURCE_METADATA",
    `collection: ${collection}`,
    `source_path: ${file.relativePath}`,
    `sha256: ${file.sha256}`,
    `category: ${file.category}`,
    `sensitivity: ${file.sensitivity}`,
    "review_status: NOT_REVIEWED",
    "publication_status: DRAFT",
    "END_NETOPS_AI_SOURCE_METADATA -->",
    "",
    file.content,
  ].join("\n");
}

export async function importKnowledgeBatch(input: KbImportBatch, createdById: string): Promise<ImportResult> {
  const prepared = input.files.map((file) => ({
    file,
    slug: articleSlug(file.name, file.sha256),
    data: {
      title: input.collection === "RESTRICTED_OPERATIONS" ? `[RESTRICTED] ${file.name}` : file.name,
      summary: articleSummary(file, input.collection),
      content: articleContent(file, input.collection),
      status: "DRAFT" as const,
      deletedAt: null,
    },
  }));
  const existing = await prisma.knowledgeBaseArticle.findMany({
    where: { slug: { in: prepared.map((article) => article.slug) } },
    select: { id: true, slug: true },
  });
  const existingBySlug = new Map(existing.map((article) => [article.slug, article.id]));
  const settled = await Promise.allSettled(
    prepared.map((article) => {
      const existingId = existingBySlug.get(article.slug);
      return existingId
        ? prisma.knowledgeBaseArticle.update({
            where: { id: existingId },
            data: { ...article.data, updatedById: createdById },
          })
        : prisma.knowledgeBaseArticle.create({
            data: {
              ...article.data,
              slug: article.slug,
              vendorId: null,
              technologyId: null,
              sourceCaseId: null,
              createdById,
            },
          });
    }),
  );

  const result: ImportResult = { created: 0, updated: 0, failed: [] };
  settled.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      result.failed.push({
        name: prepared[index].file.name,
        error: outcome.reason instanceof Error ? outcome.reason.message : "Unknown import error",
      });
    } else if (existingBySlug.has(prepared[index].slug)) {
      result.updated += 1;
    } else {
      result.created += 1;
    }
  });
  return result;
}