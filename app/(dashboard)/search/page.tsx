import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { semanticSearch } from "@/lib/embeddings/search";
import { EmbeddingProviderError } from "@/lib/embeddings/provider";
import { semanticSearchSchema } from "@/lib/validation/search";
import type { SemanticSearchResult } from "@/lib/embeddings/search";

const sourceLabel: Record<SemanticSearchResult["sourceType"], string> = {
  KB_ARTICLE: "Knowledge Base",
  COMMAND_CATALOG_ENTRY: "Command",
};

const sourceHref: Record<SemanticSearchResult["sourceType"], (id: string) => string> = {
  KB_ARTICLE: (id) => `/kb/${id}`,
  COMMAND_CATALOG_ENTRY: (id) => `/commands/${id}`,
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Any authenticated role can search - results are already restricted to
  // published, non-deleted content, the same visibility a VIEWER already has
  // via the KB and Command Catalog list pages.
  await getCurrentUser();
  const rawParams = await searchParams;

  const parsed = semanticSearchSchema.safeParse({ q: rawParams.q, limit: rawParams.limit });
  const query = typeof rawParams.q === "string" ? rawParams.q : "";

  let results: SemanticSearchResult[] = [];
  let error: string | null = null;

  if (parsed.success) {
    try {
      results = await semanticSearch(parsed.data.q, { limit: parsed.data.limit });
    } catch (cause) {
      error =
        cause instanceof EmbeddingProviderError
          ? cause.message
          : "Search is temporarily unavailable. Please try again.";
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Semantic Search</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Search across published Knowledge Base articles and Command Catalog entries by meaning, not just keywords.
      </p>

      <form method="get" className="mt-6 flex gap-3 text-sm">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="e.g. BGP session keeps flapping after an MTU change"
          className="min-w-[20rem] flex-1 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {!error && query && (
        <div className="mt-6 space-y-3">
          {results.map((result) => (
            <Link
              key={`${result.sourceType}-${result.id}`}
              href={sourceHref[result.sourceType](result.id)}
              className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{result.title}</h2>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {sourceLabel[result.sourceType]}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{result.snippet}</p>
              <p className="mt-2 text-xs text-zinc-400">Match score: {(result.score * 100).toFixed(1)}%</p>
            </Link>
          ))}
          {results.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
              No matches found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
