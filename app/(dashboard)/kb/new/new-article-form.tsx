"use client";

import { useActionState } from "react";
import { createArticleAction } from "../actions";

type Vendor = { id: string; name: string };
type Technology = { id: string; name: string };
type Prefill = {
  sourceCaseId: string;
  title: string;
  summary: string;
  content: string;
  vendorId: string;
  technologyId: string;
};

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function NewArticleForm({
  vendors,
  technologies,
  prefill,
}: {
  vendors: Vendor[];
  technologies: Technology[];
  prefill: Prefill | null;
}) {
  const [error, formAction, pending] = useActionState(createArticleAction, undefined);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {prefill && <input type="hidden" name="sourceCaseId" value={prefill.sourceCaseId} />}

      {prefill && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
          Pre-filled from the resolved case. Review before publishing.
        </p>
      )}

      <div>
        <label className={labelClass}>Title</label>
        <input name="title" required maxLength={200} defaultValue={prefill?.title} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Summary</label>
        <textarea name="summary" required rows={2} maxLength={500} defaultValue={prefill?.summary} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Content</label>
        <textarea name="content" required rows={8} defaultValue={prefill?.content} className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Vendor (optional)</label>
          <select name="vendorId" defaultValue={prefill?.vendorId ?? ""} className={inputClass}>
            <option value="">Not vendor-specific</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Technology (optional)</label>
          <select name="technologyId" defaultValue={prefill?.technologyId ?? ""} className={inputClass}>
            <option value="">Not technology-specific</option>
            {technologies.map((technology) => (
              <option key={technology.id} value={technology.id}>
                {technology.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Creating..." : "Create Article"}
      </button>
    </form>
  );
}
