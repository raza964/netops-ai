"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { createArticle } from "@/lib/data/kb";
import { recordAudit } from "@/lib/audit";
import { createArticleSchema } from "@/lib/validation/kb";

export async function createArticleAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  const parsed = createArticleSchema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary"),
    content: formData.get("content"),
    vendorId: formData.get("vendorId"),
    technologyId: formData.get("technologyId"),
    sourceCaseId: formData.get("sourceCaseId"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const article = await createArticle({
    title: parsed.data.title,
    summary: parsed.data.summary,
    content: parsed.data.content,
    vendorId: parsed.data.vendorId ?? null,
    technologyId: parsed.data.technologyId ?? null,
    sourceCaseId: parsed.data.sourceCaseId ?? null,
    createdById: user.id,
  });

  await recordAudit({
    userId: user.id,
    action: "kb.created",
    entityType: "KnowledgeBaseArticle",
    entityId: article.id,
    metadata: { title: article.title, sourceCaseId: parsed.data.sourceCaseId ?? null },
  });

  redirect(`/kb/${article.id}`);
}
