"use client";

import { useMemo, useState } from "react";

type Collection = "LECTURE" | "CHAT" | "RESTRICTED_OPERATIONS";
type Sensitivity = "STANDARD" | "MEDIUM" | "HIGH";
type Totals = {
  created: number;
  updated: number;
  commandsCreated: number;
  commandsUpdated: number;
  failed: Array<{ name: string; error: string }>;
};
type PreparedFile = {
  name: string;
  relativePath: string;
  content: string;
  sha256: string;
  category: string;
  sensitivity: Sensitivity;
};

const BATCH_SIZE = 20;
const MAX_BATCH_BYTES = 4_500_000;
const EMPTY_TOTALS: Totals = { created: 0, updated: 0, commandsCreated: 0, commandsUpdated: 0, failed: [] };
const folderInputProps = { webkitdirectory: "", directory: "" } as Record<string, string>;

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function relativePath(file: File): string {
  return (file.webkitRelativePath || file.name).replace(/\\/g, "/");
}

function inferCategory(file: File): string {
  const parts = relativePath(file).split("/").filter(Boolean);
  return parts.length > 1 ? parts.at(-2) || "uncategorized" : "uncategorized";
}

function inferSensitivity(collection: Collection, file: File): Sensitivity {
  const path = relativePath(file);
  if (collection === "RESTRICTED_OPERATIONS") return "HIGH";
  if (/(password|credential|secret|token|login|private.?key)/i.test(path)) return "HIGH";
  if (/(config|vpn|ssh|radius|firewall|router|switch|client|payment)/i.test(path)) return "MEDIUM";
  return "STANDARD";
}

function mergeFiles(current: File[], incoming: File[]): File[] {
  const merged = new Map(current.map((file) => [`${relativePath(file)}:${file.size}:${file.lastModified}`, file]));
  for (const file of incoming) {
    if (/\.md$/i.test(file.name)) merged.set(`${relativePath(file)}:${file.size}:${file.lastModified}`, file);
  }
  return [...merged.values()].sort((a, b) => relativePath(a).localeCompare(relativePath(b)));
}

async function postBatch(collection: Collection, files: PreparedFile[]): Promise<Totals> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch("/api/kb/import", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, files }),
    });
    const body = (await response.json()) as Partial<Totals> & { articleIds?: string[]; error?: string };
    if (response.ok || response.status === 207) {
      const commandResponse = await fetch("/api/commands/extract", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: body.articleIds ?? [] }),
      });
      const commandBody = (await commandResponse.json()) as {
        created?: number;
        updated?: number;
        failed?: Array<{ article: string; error: string }>;
        error?: string;
      };
      if (!commandResponse.ok && commandResponse.status !== 207) {
        throw new Error(commandBody.error || "Command extraction failed.");
      }
      return {
        created: body.created ?? 0,
        updated: body.updated ?? 0,
        commandsCreated: commandBody.created ?? 0,
        commandsUpdated: commandBody.updated ?? 0,
        failed: [
          ...(body.failed ?? []),
          ...(commandBody.failed ?? []).map((failure) => ({ name: failure.article, error: failure.error })),
        ],
      };
    }
    if ((response.status !== 429 && response.status < 500) || attempt === 4) {
      throw new Error(body.error || `Import failed with HTTP ${response.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw new Error("Import retry limit reached.");
}

export function KnowledgeImportClient() {
  const [collection, setCollection] = useState<Collection>("LECTURE");
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [organized, setOrganized] = useState<number | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<{
    scanned: number;
    created: number;
    updated: number;
    failed: number;
  } | null>(null);
  const [processed, setProcessed] = useState(0);
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const progress = useMemo(
    () => (files.length === 0 ? 0 : Math.round((processed / files.length) * 100)),
    [files.length, processed],
  );

  async function startImport() {
    if (files.length === 0 || running) return;
    setRunning(true);
    setProcessed(0);
    const nextTotals: Totals = { ...EMPTY_TOTALS, failed: [] };
    try {
      let offset = 0;
      while (offset < files.length) {
        const payloadFiles: PreparedFile[] = [];
        let batchBytes = 0;
        while (offset < files.length && payloadFiles.length < BATCH_SIZE) {
          const file = files[offset];
          const rawContent = await file.text();
          const content = rawContent.length > 0
            ? rawContent
            : "<!-- EMPTY_SOURCE_FILE -->\nThis source file was empty at intake and is retained as a review placeholder.";
          const contentBytes = new TextEncoder().encode(content).byteLength;
          if (contentBytes > 2_000_000) {
            nextTotals.failed.push({ name: relativePath(file), error: "File exceeds the 2 MB safety limit." });
            offset += 1;
            setProcessed(offset);
            continue;
          }
          if (payloadFiles.length > 0 && batchBytes + contentBytes > MAX_BATCH_BYTES) break;
          payloadFiles.push({
            name: file.name,
            relativePath: relativePath(file),
            content,
            sha256: await sha256(rawContent),
            category: inferCategory(file),
            sensitivity: inferSensitivity(collection, file),
          });
          batchBytes += contentBytes;
          offset += 1;
        }
        if (payloadFiles.length > 0) {
          const result = await postBatch(collection, payloadFiles);
          nextTotals.created += result.created;
          nextTotals.updated += result.updated;
          nextTotals.commandsCreated += result.commandsCreated;
          nextTotals.commandsUpdated += result.commandsUpdated;
          nextTotals.failed.push(...result.failed);
        }
        setProcessed(offset);
        setTotals({ ...nextTotals, failed: [...nextTotals.failed] });
      }
    } catch (error) {
      nextTotals.failed.push({ name: "Import batch", error: error instanceof Error ? error.message : "Unknown import error" });
      setTotals({ ...nextTotals, failed: [...nextTotals.failed] });
    } finally {
      setRunning(false);
    }
  }

  async function organizeExistingDrafts() {
    if (organizing || running || extracting) return;
    setOrganizing(true);
    setOrganized(null);
    let total = 0;
    try {
      while (true) {
        const response = await fetch("/api/kb/organize", { method: "POST", credentials: "same-origin" });
        const body = (await response.json()) as { organized?: number; remaining?: number; error?: string };
        if (!response.ok) throw new Error(body.error || "Organization failed.");
        total += body.organized ?? 0;
        setOrganized(total);
        if ((body.remaining ?? 0) === 0 || (body.organized ?? 0) === 0) break;
      }
    } finally {
      setOrganizing(false);
    }
  }

  async function extractExistingCommands() {
    if (extracting || running || organizing) return;
    setExtracting(true);
    let cursor: string | null = null;
    const current = { scanned: 0, created: 0, updated: 0, failed: 0 };
    setExtractionProgress({ ...current });
    try {
      while (true) {
        const response = await fetch("/api/commands/extract", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        const body = (await response.json()) as {
          scanned?: number; created?: number; updated?: number; failed?: unknown[];
          nextCursor?: string | null; hasMore?: boolean; error?: string;
        };
        if (!response.ok && response.status !== 207) throw new Error(body.error || "Command extraction failed.");
        current.scanned += body.scanned ?? 0;
        current.created += body.created ?? 0;
        current.updated += body.updated ?? 0;
        current.failed += body.failed?.length ?? 0;
        setExtractionProgress({ ...current });
        cursor = body.nextCursor ?? null;
        if (!body.hasMore || !cursor) break;
      }
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block text-sm font-medium">
          Collection
          <select value={collection} onChange={(event) => setCollection(event.target.value as Collection)} disabled={running} className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
            <option value="LECTURE">Lecture material</option>
            <option value="CHAT">Historical chat knowledge</option>
            <option value="RESTRICTED_OPERATIONS">Restricted device configurations</option>
          </select>
        </label>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Add Markdown files
            <input type="file" accept=".md,text/markdown,text/plain" multiple disabled={running} onChange={(event) => setFiles((current) => mergeFiles(current, Array.from(event.target.files ?? [])))} className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700" />
          </label>
          <label className="block text-sm font-medium">Add complete folder
            <input type="file" accept=".md,text/markdown,text/plain" multiple {...folderInputProps} disabled={running} onChange={(event) => setFiles((current) => mergeFiles(current, Array.from(event.target.files ?? [])))} className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700" />
          </label>
        </div>
        <p className="mt-3 text-sm text-zinc-500">Selected: {files.length} Markdown files. Each import creates knowledge drafts and extracts duplicate-safe vendor/technology-scoped command drafts.</p>
        {collection === "RESTRICTED_OPERATIONS" && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">Restricted imports and extracted commands remain DRAFT and require sanitization before publication.</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={startImport} disabled={files.length === 0 || running || extracting} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900">{running ? "Importing and extracting..." : "Import sources and commands"}</button>
          <button type="button" onClick={organizeExistingDrafts} disabled={running || organizing || extracting} className="rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700">{organizing ? "Organizing..." : "Organize existing drafts"}</button>
          <button type="button" onClick={extractExistingCommands} disabled={running || organizing || extracting} className="rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700">{extracting ? "Extracting commands..." : "Extract structured commands"}</button>
          <button type="button" onClick={() => { setFiles([]); setProcessed(0); setTotals({ ...EMPTY_TOTALS, failed: [] }); }} disabled={running || files.length === 0} className="rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700">Clear selection</button>
        </div>
      </div>
      {organized !== null && !organizing && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Organized {organized} imported drafts into filterable categories.</p>}
      {extractionProgress && <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{extracting ? "Extracting commands: " : "Command extraction complete: "}{extractionProgress.scanned} articles scanned, {extractionProgress.created} commands created, {extractionProgress.updated} existing commands updated, {extractionProgress.failed} failed.</p>}
      {(running || processed > 0 || totals.failed.length > 0) && (
        <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex justify-between text-sm"><span>{processed} / {files.length} processed</span><span>{progress}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-3 text-sm">Knowledge created: {totals.created} / Updated: {totals.updated} / Failed: {totals.failed.length}</p>
          <p className="mt-1 text-sm">Commands created: {totals.commandsCreated} / Updated: {totals.commandsUpdated}</p>
          {processed === files.length && !running && totals.failed.length === 0 && <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Import completed. Knowledge and commands are saved as reviewable drafts.</p>}
          {totals.failed.length > 0 && <ul className="mt-3 max-h-48 overflow-auto text-sm text-red-700 dark:text-red-300">{totals.failed.map((failure, index) => <li key={`${failure.name}-${index}`}>{failure.name}: {failure.error}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
