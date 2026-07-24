import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getArticleDetail } from "@/lib/data/kb";
import { ArticleStatusControls } from "./article-status-controls";
import { DeleteArticleForm } from "./delete-article-form";

export default async function ArticleDetailPage({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params;
  const user = await getCurrentUser();
  const article = await getArticleDetail(articleId);

  // Non-published articles are drafts/archive - only authors and admins
  // should know they exist at all, so a viewer gets a plain 404.
  if (!article || (user.role === "VIEWER" && article.status !== "PUBLISHED")) {
    notFound();
  }

  const canEdit = user.role === "ENGINEER" || user.role === "ADMIN";
  const canManage = user.role === "ADMIN";

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{article.title}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {[article.vendor?.name, article.technology?.name].filter(Boolean).join(" · ") || "General"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {article.status}
          </span>
        </div>
        <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">{article.summary}</p>
        <p className="mt-2 text-xs text-zinc-400">
          Written by {article.createdBy.name} on {article.createdAt.toLocaleString()}
          {article.updatedBy && ` · last edited by ${article.updatedBy.name}`}
          {article.sourceCase && (
            <>
              {" "}
              ·{" "}
              <Link href={`/cases/${article.sourceCase.id}`} className="text-blue-600 dark:text-blue-400">
                source case: {article.sourceCase.title}
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{article.content}</p>
      </div>

      {(canEdit || canManage) && (
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <Link
              href={`/kb/${article.id}/edit`}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            >
              Edit
            </Link>
          )}
          {canManage && <ArticleStatusControls articleId={article.id} status={article.status} />}
        </div>
      )}

      {canManage && <DeleteArticleForm articleId={article.id} articleTitle={article.title} />}
    </div>
  );
}
