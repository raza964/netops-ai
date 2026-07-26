import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { listArticles } from "@/lib/data/kb";
import { getVendorsWithDeviceTypes, getTechnologies } from "@/lib/data/reference";
import { articleFilterSchema, articleStatusValues } from "@/lib/validation/kb";
import type { ArticleStatus } from "@prisma/client";

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const rawParams = await searchParams;

  const filterParsed = articleFilterSchema.safeParse({
    status: rawParams.status,
    vendorId: rawParams.vendorId,
    technologyId: rawParams.technologyId,
    q: rawParams.q,
    page: rawParams.page,
  });
  const filter = filterParsed.success ? filterParsed.data : articleFilterSchema.parse({});

  const isViewer = user.role === "VIEWER";
  const statuses: ArticleStatus[] = isViewer
    ? ["PUBLISHED"]
    : filter.status
      ? [filter.status]
      : ["DRAFT", "PUBLISHED", "ARCHIVED"];

  const [articleResult, vendors, technologies] = await Promise.all([
    listArticles({ statuses, vendorId: filter.vendorId, technologyId: filter.technologyId, query: filter.q, page: filter.page }),
    getVendorsWithDeviceTypes(),
    getTechnologies(),
  ]);

  const canCreate = user.role === "ADMIN" || user.role === "ENGINEER";
  const canImport = user.role === "ADMIN";
  const { items: articles, total, page, pageCount } = articleResult;
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (filter.q) params.set("q", filter.q);
    if (filter.status) params.set("status", filter.status);
    if (filter.vendorId) params.set("vendorId", filter.vendorId);
    if (filter.technologyId) params.set("technologyId", filter.technologyId);
    params.set("page", String(targetPage));
    return `/kb?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Knowledge Base</h1>
        <div className="flex gap-2">
          {canImport && (
            <Link
              href="/kb/import"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Import Sources
            </Link>
          )}
          {canCreate && (
            <Link
              href="/kb/new"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              New Article
            </Link>
          )}
        </div>
      </div>

      <form method="get" className="mt-6 flex flex-wrap gap-3 text-sm">
        <input
          type="text"
          name="q"
          defaultValue={filter.q ?? ""}
          placeholder="Search title, summary, content..."
          className="min-w-[16rem] flex-1 rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        />

        {!isViewer && (
          <select
            name="status"
            defaultValue={filter.status ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All statuses</option>
            {articleStatusValues.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        )}

        <select
          name="vendorId"
          defaultValue={filter.vendorId ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All vendors</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>

        <select
          name="technologyId"
          defaultValue={filter.technologyId ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All technologies</option>
          {technologies.map((technology) => (
            <option key={technology.id} value={technology.id}>
              {technology.name}
            </option>
          ))}
        </select>

        <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">
          Filter
        </button>
      </form>

      <p className="mt-4 text-sm text-zinc-500">
        {total.toLocaleString()} article{total === 1 ? "" : "s"} · Page {page} of {pageCount}
      </p>

      <div className="mt-6 space-y-3">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/kb/${article.id}`}
            className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{article.title}</h2>
              <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {article.status}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{article.summary}</p>
            <p className="mt-2 text-xs text-zinc-400">
              {[article.vendor?.name, article.technology?.name].filter(Boolean).join(" / ") || "General"}{" / "}
              {article.createdBy.name}
            </p>
          </Link>
        ))}
        {articles.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
            No articles match these filters.
          </div>
        )}
      </div>

      {pageCount > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Knowledge base pagination">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700">Previous</Link>
          ) : <span />}
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700">Next</Link>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
