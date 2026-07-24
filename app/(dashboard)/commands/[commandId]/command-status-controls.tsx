"use client";

import { archiveCommandAction, publishCommandAction } from "./actions";

export function CommandStatusControls({ commandId, status }: { commandId: string; status: string }) {
  const publishAction = publishCommandAction.bind(null, commandId);
  const archiveAction = archiveCommandAction.bind(null, commandId);

  if (status === "PUBLISHED") {
    return (
      <form action={archiveAction}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
        >
          Archive
        </button>
      </form>
    );
  }

  return (
    <form action={publishAction}>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Publish
      </button>
    </form>
  );
}
