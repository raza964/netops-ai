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
  const result: ImportResult = { created: 0, updated: 0, failed: [] };

  for (const file of input.files) {
    try {
      const slug = articleSlug(file.name, file.sha256);
      const existing = await prisma.knowledgeBaseArticle.findUnique({
        where: { slug },
        select: { id: true },
      });
      const data = {
        title: input.collection === "RESTRICTED_OPERATIONS" ? `[RESTRICTED] ${file.name}` : file.name,
        summary: articleSummary(file, input.collection),
        content: articleContent(file, input.collection),
        status: "DRAFT" as const,
        deletedAt: null,
      };

      if (existing) {
        await prisma.knowledgeBaseArticle.update({
          where: { id: existing.id },
          data: { ...data, updatedById: createdById },
        });
        result.updated += 1;
      } else {
        await prisma.knowledgeBaseArticle.create({
          data: {
            ...data,
            slug,
            vendorId: null,
            technologyId: null,
            sourceCaseId: null,
            createdById,
          },
        });
        result.created += 1;
      }
    } catch (error) {
      result.failed.push({
        name: file.name,
        error: error instanceof Error ? error.message : "Unknown import error",
      });
    }
  }

  return result;
}
