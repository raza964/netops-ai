"use client";

import { useActionState } from "react";
import { softDeleteCaseAction } from "./actions";

export function DeleteCaseForm({ caseId, caseTitle }: { caseId: string; caseTitle: string }) {
  const action = softDeleteCaseAction.bind(null, caseId);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      className="rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20"
    >
      <h3 className="font-medium text-red-800 dark:text-red-300">Delete Case</h3>
      <p className="mt-1 text-sm text-red-700 dark:text-red-400">
        This removes the case from all lists. Type the case title (
        <span className="font-mono">{caseTitle}</span>) to confirm.
      </p>
      <input
        name="confirmation"
        required
        placeholder={caseTitle}
        className="mt-3 w-full rounded-md border border-red-300 px-3 py-2 text-sm dark:border-red-900/40 dark:bg-zinc-900"
      />
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Deleting..." : "Delete Case"}
      </button>
    </form>
  );
}
