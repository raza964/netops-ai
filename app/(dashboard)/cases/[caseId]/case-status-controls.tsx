"use client";

import { useActionState } from "react";
import { closeCaseAction, resolveCaseAction, startCaseAction } from "./actions";

export function CaseStatusControls({ caseId, status }: { caseId: string; status: string }) {
  const startAction = startCaseAction.bind(null, caseId);
  const closeAction = closeCaseAction.bind(null, caseId);
  const resolveAction = resolveCaseAction.bind(null, caseId);
  const [resolveError, resolveFormAction, resolvePending] = useActionState(resolveAction, undefined);

  if (status === "OPEN") {
    return (
      <form action={startAction}>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Start Working
        </button>
      </form>
    );
  }

  if (status === "IN_PROGRESS") {
    return (
      <form
        action={resolveFormAction}
        className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h3 className="font-medium text-zinc-900 dark:text-zinc-50">Resolve Case</h3>
        <div className="mt-3 space-y-3 text-sm">
          <textarea
            name="rootCause"
            required
            placeholder="Root cause"
            rows={2}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <textarea
            name="resolution"
            required
            placeholder="Resolution"
            rows={2}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <textarea
            name="verification"
            required
            placeholder="Verification steps"
            rows={2}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        {resolveError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{resolveError}</p>}
        <button
          type="submit"
          disabled={resolvePending}
          className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {resolvePending ? "Resolving..." : "Mark Resolved"}
        </button>
      </form>
    );
  }

  if (status === "RESOLVED") {
    return (
      <form action={closeAction}>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Close Case
        </button>
      </form>
    );
  }

  return null;
}
