import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { slugify } from "../slug";
import type { KbImportBatch } from "../validation/kb-import";

export type ImportResult = {
  created: number;
  updated: number;
  articleIds: string[];
  failed: Array<{ name: string; error: string }>;
};

function stableArticleSlug(collection: KbImportBatch["collection"], relativePath: string): string {
  const normalizedPath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  const base = slugify(normalizedPath.replace(/\.md$/i, "")) || "imported-article";
  const identityHash = createHash("sha256").update(`${collection}:${normalizedPath}`).digest("hex").slice(0, 16);
  return `source-${base.slice(0, 80)}-${identityHash}`;
}

function legacyArticleSlug(name: string, sha256: string): string {
  const base = slugify(name.replace(/\.md$/i, "")) || "imported-article";
  return `source-${base.slice(0, 80)}-${sha256.slice(0, 16)}`;
}

function categoryName(category: string): string {
  return category
    .replace(/^\d+[\s_-]*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || "Uncategorized";
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
  const categories = [...new Set(input.files.map((file) => file.category))];
  const technologies = await Promise.all(
    categories.map((category) => {
      const slug = slugify(category) || "uncategorized";
      return prisma.technology.upsert({
        where: { slug },
        update: {},
        create: { slug, name: categoryName(category) },
        select: { id: true, slug: true },
      });
    }),
  );
  const technologyByCategory = new Map(
    categories.map((category, index) => [category, technologies[index].id]),
  );
  const prepared = input.files.map((file) => ({
    file,
    slug: stableArticleSlug(input.collection, file.relativePath),
    legacySlug: legacyArticleSlug(file.name, file.sha256),
    sourceMarker: `source_path: ${file.relativePath}`,
    collectionMarker: `collection: ${input.collection}`,
    data: {
      title: input.collection === "RESTRICTED_OPERATIONS" ? `[RESTRICTED] ${file.name}` : file.name,
      summary: articleSummary(file, input.collection),
      content: articleContent(file, input.collection),
      status: "DRAFT" as const,
      deletedAt: null,
      technologyId: technologyByCategory.get(file.category) ?? null,
    },
  }));

  const existing = await prisma.knowledgeBaseArticle.findMany({
    where: {
      OR: [
        { slug: { in: prepared.flatMap((article) => [article.slug, article.legacySlug]) } },
        ...prepared.map((article) => ({ content: { contains: article.sourceMarker } })),
      ],
    },
    select: { id: true, slug: true, content: true },
  });
  const claimedIds = new Set<string>();
  const existingIds = prepared.map((article) => {
    const match = existing.find(
      (candidate) =>
        !claimedIds.has(candidate.id) &&
        (candidate.slug === article.slug ||
          candidate.slug === article.legacySlug ||
          (candidate.content.includes(article.sourceMarker) && candidate.content.includes(article.collectionMarker))),
    );
    if (match) claimedIds.add(match.id);
    return match?.id;
  });

  const settled = await Promise.allSettled(
    prepared.map((article, index) => {
      const existingId = existingIds[index];
      return existingId
        ? prisma.knowledgeBaseArticle.update({
            where: { id: existingId },
            data: { ...article.data, slug: article.slug, updatedById: createdById },
          })
        : prisma.knowledgeBaseArticle.create({
            data: {
              ...article.data,
              slug: article.slug,
              vendorId: null,
              technologyId: article.data.technologyId,
              sourceCaseId: null,
              createdById,
            },
          });
    }),
  );

  const result: ImportResult = { created: 0, updated: 0, articleIds: [], failed: [] };
  settled.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      result.failed.push({
        name: prepared[index].file.name,
        error: outcome.reason instanceof Error ? outcome.reason.message : "Unknown import error",
      });
    } else {
      result.articleIds.push(outcome.value.id);
      if (existingIds[index]) result.updated += 1;
      else result.created += 1;
    }
  });
  return result;
}