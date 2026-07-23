"use client";

import { decideStepAction } from "./actions";

export function StepDecisionButtons({ caseId, stepId }: { caseId: string; stepId: string }) {
  const approveAction = decideStepAction.bind(null, caseId, stepId, "APPROVED");
  const rejectAction = decideStepAction.bind(null, caseId, stepId, "REJECTED");

  return (
    <div className="flex gap-2">
      <form action={approveAction}>
        <button
          type="submit"
          className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
        >
          Approve
        </button>
      </form>
      <form action={rejectAction}>
        <button
          type="submit"
          className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300"
        >
          Reject
        </button>
      </form>
    </div>
  );
}
