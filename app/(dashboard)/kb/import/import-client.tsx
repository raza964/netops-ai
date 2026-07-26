"use client";

import { useMemo, useState } from "react";

type Collection = "LECTURE" | "CHAT" | "RESTRICTED_OPERATIONS";
type Sensitivity = "STANDARD" | "MEDIUM" | "HIGH";
type Totals = { created: number; updated: number; failed: Array<{ name: string; error: string }> };

const BATCH_SIZE = 20;

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function inferCategory(file: File): string {
  const relativePath = file.webkitRelativePath || file.name;
  const parts = relativePath.split("/");
  return parts.length > 1 ? parts.at(-2) || "uncategorized" : "uncategorized";
}

function inferSensitivity(collection: Collection, file: File): Sensitivity {
  if (collection === "RESTRICTED_OPERATIONS") return "HIGH";
  if (/(password|credential|secret|token|login|private.?key)/i.test(file.name)) return "HIGH";
  if (/(config|vpn|ssh|radius|firewall|router|switch|client|payment)/i.test(file.name)) return "MEDIUM";
  return "STANDARD";
}

export function KnowledgeImportClient() {
  const [collection, setCollection] = useState<Collection>("LECTURE");
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [totals, setTotals] = useState<Totals>({ created: 0, updated: 0, failed: [] });
  const progress = useMemo(
    () => (files.length === 0 ? 0 : Math.round((processed / files.length) * 100)),
    [files.length, processed],
  );

  async function startImport() {
    if (files.length === 0 || running) return;
    setRunning(true);
    setProcessed(0);
    const nextTotals: Totals = { created: 0, updated: 0, failed: [] };

    try {
      for (let offset = 0; offset < files.length; offset += BATCH_SIZE) {
        const batch = files.slice(offset, offset + BATCH_SIZE);
        const payloadFiles = await Promise.all(
          batch.map(async (file) => {
            const content = await file.text();
            return {
              name: file.name,
              relativePath: file.webkitRelativePath || file.name,
              content,
              sha256: await sha256(content),
              category: inferCategory(file),
              sensitivity: inferSensitivity(collection, file),
            };
          }),
        );

        const response = await fetch("/api/kb/import", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection, files: payloadFiles }),
        });
        const body = (await response.json()) as Partial<Totals> & { error?: string };
        if (!response.ok && response.status !== 207) {
          throw new Error(body.error || `Import failed with HTTP ${response.status}.`);
        }

        nextTotals.created += body.created ?? 0;
        nextTotals.updated += body.updated ?? 0;
        nextTotals.failed.push(...(body.failed ?? []));
        setProcessed(Math.min(offset + batch.length, files.length));
        setTotals({ ...nextTotals, failed: [...nextTotals.failed] });
      }
    } catch (error) {
      nextTotals.failed.push({
        name: "Import batch",
        error: error instanceof Error ? error.message : "Unknown import error",
      });
      setTotals({ ...nextTotals, failed: [...nextTotals.failed] });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block text-sm font-medium">
          Collection
          <select
            value={collection}
            onChange={(event) => setCollection(event.target.value as Collection)}
            disabled={running}
            className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="LECTURE">Lecture material</option>
            <option value="CHAT">Historical chat knowledge</option>
            <option value="RESTRICTED_OPERATIONS">Restricted device configurations</option>
          </select>
        </label>

        <label className="mt-5 block text-sm font-medium">
          Markdown files
          <input
            type="file"
            accept=".md,text/markdown,text/plain"
            multiple
            disabled={running}
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
        </label>

        <p className="mt-3 text-sm text-zinc-500">
          Selected: {files.length} files. Every import is saved as DRAFT. Existing files with the same content hash are updated.
        </p>

        {collection === "RESTRICTED_OPERATIONS" && (
          <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            Restricted imports remain DRAFT and must never be published before credential and infrastructure sanitization.
          </p>
        )}

        <button
          type="button"
          onClick={startImport}
          disabled={files.length === 0 || running}
          className="mt-5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {running ? "Importing..." : "Import selected files"}
        </button>
      </div>

      {(running || processed > 0 || totals.failed.length > 0) && (
        <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex justify-between text-sm">
            <span>{processed} / {files.length} processed</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-sm">
            Created: {totals.created} · Updated: {totals.updated} · Failed: {totals.failed.length}
          </p>
          {totals.failed.length > 0 && (
            <ul className="mt-3 max-h-48 overflow-auto text-sm text-red-700 dark:text-red-300">
              {totals.failed.map((failure, index) => (
                <li key={`${failure.name}-${index}`}>{failure.name}: {failure.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
