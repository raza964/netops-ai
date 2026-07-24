import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getCommandDetail } from "@/lib/data/commands";
import { CommandStatusControls } from "./command-status-controls";
import { DeleteCommandForm } from "./delete-command-form";

export default async function CommandDetailPage({ params }: { params: Promise<{ commandId: string }> }) {
  const { commandId } = await params;
  const user = await getCurrentUser();
  const command = await getCommandDetail(commandId);

  // Non-published entries are drafts/archive - only authors and admins
  // should know they exist at all, so a viewer gets a plain 404.
  if (!command || (user.role === "VIEWER" && command.status !== "PUBLISHED")) {
    notFound();
  }

  const canEdit = user.role === "ENGINEER" || user.role === "ADMIN";
  const canManage = user.role === "ADMIN";

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{command.title}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {[command.vendor.name, command.deviceType?.name, command.technology?.name].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {command.riskLevel}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {command.status}
            </span>
          </div>
        </div>
        <p className="mt-4 text-xs text-zinc-400">
          {command.isConfigChange ? "Configuration-changing" : "Read-only"} · Written by {command.createdBy.name} on{" "}
          {command.createdAt.toLocaleString()}
          {command.updatedBy && ` · last edited by ${command.updatedBy.name}`}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="font-mono text-sm text-zinc-900 dark:text-zinc-50">{command.commandText}</p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{command.description}</p>
      </div>

      {command.purpose && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Purpose</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{command.purpose}</p>
        </div>
      )}

      {command.expectedOutput && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Expected Output</h3>
          <p className="mt-1 whitespace-pre-wrap font-mono text-xs text-zinc-700 dark:text-zinc-300">
            {command.expectedOutput}
          </p>
        </div>
      )}

      {(canEdit || canManage) && (
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <Link
              href={`/commands/${command.id}/edit`}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            >
              Edit
            </Link>
          )}
          {canManage && <CommandStatusControls commandId={command.id} status={command.status} />}
        </div>
      )}

      {canManage && <DeleteCommandForm commandId={command.id} commandTitle={command.title} />}
    </div>
  );
}
