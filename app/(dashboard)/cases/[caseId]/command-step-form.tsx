"use client";

import { useActionState } from "react";
import { addCommandStepAction } from "./actions";

export function CommandStepForm({ caseId }: { caseId: string }) {
  const action = addCommandStepAction.bind(null, caseId);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h3 className="font-medium text-zinc-900 dark:text-zinc-50">Log a Command</h3>
      <div className="mt-3 space-y-3 text-sm">
        <textarea
          name="commandText"
          required
          placeholder="Command executed (e.g. show ip bgp summary)"
          rows={2}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <textarea
          name="commandOutput"
          placeholder="Command output (optional)"
          rows={4}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" name="isConfigChange" className="rounded border-zinc-300" />
          This is a configuration-changing command (requires peer approval)
        </label>
      </div>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Logging..." : "Log Command"}
      </button>
    </form>
  );
}
