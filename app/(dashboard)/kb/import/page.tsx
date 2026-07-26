import { requireRole } from "@/lib/dal";
import { KnowledgeImportClient } from "./import-client";

export default async function KnowledgeImportPage() {
  await requireRole(["ADMIN"]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Import Knowledge Sources</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Permanently ingest individual Markdown files or complete folders as reviewable drafts. Folder names become filterable categories, and re-importing the same source path updates the existing record without duplicates. Nothing is automatically published or indexed for AI retrieval.
      </p>
      <div className="mt-6">
        <KnowledgeImportClient />
      </div>
    </div>
  );
}
