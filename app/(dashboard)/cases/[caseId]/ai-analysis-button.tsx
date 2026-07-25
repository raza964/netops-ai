"use client";

import { useActionState } from "react";
import { generateAiAnalysisAction } from "./actions";

export function AiAnalysisButton({ caseId }: { caseId: string }) {
  const [error, action, pending] = useActionState(
    async () => generateAiAnalysisAction(caseId),
    undefined,
  );

  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Analyzing…" : "Generate AI analysis"}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <p className="text-xs text-zinc-500">
        AI output is advisory. Verify evidence and review any configuration change before execution.
      </p>
    </form>
  );
}
