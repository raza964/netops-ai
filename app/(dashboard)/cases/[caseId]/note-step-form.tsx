"use client";

import { useActionState } from "react";
import { addNoteStepAction } from "./actions";

export function NoteStepForm({ caseId }: { caseId: string }) {
  const action = addNoteStepAction.bind(null, caseId);
  const [error, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h3 className="font-medium text-zinc-900 dark:text-zinc-50">Add a Note</h3>
      <div className="mt-3">
        <textarea
          name="note"
          required
          placeholder="Engineer notes / observations"
          rows={6}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Saving..." : "Add Note"}
      </button>
    </form>
  );
}
