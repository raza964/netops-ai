import { requireRole } from "@/lib/dal";
import { KnowledgeImportClient } from "./import-client";

export default async function KnowledgeImportPage() {
  await requireRole(["ADMIN"]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Import Knowledge and Commands</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Permanently ingest Markdown files or complete folders as reviewable knowledge and structured command records. Commands are classified by vendor, device type, technology, purpose, risk, and configuration impact. Re-importing the same source updates existing records without duplicates. Nothing is automatically published.
      </p>
      <div className="mt-6">
        <KnowledgeImportClient />
      </div>
    </div>
  );
}
