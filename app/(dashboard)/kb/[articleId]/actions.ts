"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { recordAudit } from "@/lib/audit";
import { archiveArticle, getArticleDetail, publishArticle, softDeleteArticle, updateArticle } from "@/lib/data/kb";
import { deleteArticleSchema, updateArticleSchema } from "@/lib/validation/kb";
import { indexKbArticle, removeArticleEmbedding } from "@/lib/embeddings/indexer";

/**
 * Indexing is best-effort: a Voyage outage must never block a publish/edit
 * from succeeding, so failures are logged and swallowed here rather than
 * propagated to the caller.
 */
async function reindexArticle(articleId: string) {
  try {
    await indexKbArticle(articleId);
  } catch (error) {
    console.error(`Failed to index KnowledgeBaseArticle ${articleId} for search`, error);
  }
}

export async function updateArticleAction(articleId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  const parsed = updateArticleSchema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary"),
    content: formData.get("content"),
    vendorId: formData.get("vendorId"),
    technologyId: formData.get("technologyId"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  await updateArticle({
    articleId,
    title: parsed.data.title,
    summary: parsed.data.summary,
    content: parsed.data.content,
    vendorId: parsed.data.vendorId ?? null,
    technologyId: parsed.data.technologyId ?? null,
    updatedById: user.id,
  });

  await recordAudit({
    userId: user.id,
    action: "kb.updated",
    entityType: "KnowledgeBaseArticle",
    entityId: articleId,
    metadata: { title: parsed.data.title },
  });

  await reindexArticle(articleId);

  redirect(`/kb/${articleId}`);
}

export async function publishArticleAction(articleId: string) {
  const user = await requireRole(["ADMIN"]);

  await publishArticle(articleId);

  await recordAudit({
    userId: user.id,
    action: "kb.published",
    entityType: "KnowledgeBaseArticle",
    entityId: articleId,
    metadata: {},
  });

  await reindexArticle(articleId);

  revalidatePath(`/kb/${articleId}`);
}

export async function archiveArticleAction(articleId: string) {
  const user = await requireRole(["ADMIN"]);

  await archiveArticle(articleId);

  await recordAudit({
    userId: user.id,
    action: "kb.archived",
    entityType: "KnowledgeBaseArticle",
    entityId: articleId,
    metadata: {},
  });

  await removeArticleEmbedding(articleId);

  revalidatePath(`/kb/${articleId}`);
}

export async function softDeleteArticleAction(articleId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const article = await getArticleDetail(articleId);
  if (!article) {
    throw new Error("Article not found.");
  }

  const parsed = deleteArticleSchema.safeParse({ confirmation: formData.get("confirmation") });
  if (!parsed.success || parsed.data.confirmation !== article.title) {
    return "Confirmation text does not match the article title.";
  }

  await softDeleteArticle(articleId);

  await recordAudit({
    userId: user.id,
    action: "kb.soft_deleted",
    entityType: "KnowledgeBaseArticle",
    entityId: articleId,
    metadata: { title: article.title },
  });

  await removeArticleEmbedding(articleId);

  redirect("/kb");
}
