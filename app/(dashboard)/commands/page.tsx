import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { listCommands } from "@/lib/data/commands";
import { getVendorsWithDeviceTypes, getTechnologies } from "@/lib/data/reference";
import { commandFilterSchema, commandStatusValues, riskLevelValues } from "@/lib/validation/command";
import type { CommandStatus } from "@prisma/client";

const riskBadgeClass: Record<string, string> = {
  LOW: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};

export default async function CommandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const rawParams = await searchParams;

  const filterParsed = commandFilterSchema.safeParse({
    status: rawParams.status,
    vendorId: rawParams.vendorId,
    technologyId: rawParams.technologyId,
    riskLevel: rawParams.riskLevel,
    q: rawParams.q,
  });
  const filter = filterParsed.success ? filterParsed.data : {};

  const isViewer = user.role === "VIEWER";
  const statuses: CommandStatus[] = isViewer
    ? ["PUBLISHED"]
    : filter.status
      ? [filter.status]
      : ["DRAFT", "PUBLISHED", "ARCHIVED"];

  const [commands, vendors, technologies] = await Promise.all([
    listCommands({
      statuses,
      vendorId: filter.vendorId,
      technologyId: filter.technologyId,
      riskLevel: filter.riskLevel,
      query: filter.q,
    }),
    getVendorsWithDeviceTypes(),
    getTechnologies(),
  ]);

  const canCreate = user.role === "ADMIN" || user.role === "ENGINEER";

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Command Catalog</h1>
        {canCreate && (
          <Link
            href="/commands/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            New Command
          </Link>
        )}
      </div>

      <form method="get" className="mt-6 flex flex-wrap gap-3 text-sm">
        <input
          type="text"
          name="q"
          defaultValue={filter.q ?? ""}
          placeholder="Search title, command, description..."
          className="min-w-[16rem] flex-1 rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        />

        {!isViewer && (
          <select
            name="status"
            defaultValue={filter.status ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All statuses</option>
            {commandStatusValues.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        )}

        <select
          name="vendorId"
          defaultValue={filter.vendorId ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All vendors</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>

        <select
          name="technologyId"
          defaultValue={filter.technologyId ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All technologies</option>
          {technologies.map((technology) => (
            <option key={technology.id} value={technology.id}>
              {technology.name}
            </option>
          ))}
        </select>

        <select
          name="riskLevel"
          defaultValue={filter.riskLevel ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All risk levels</option>
          {riskLevelValues.map((risk) => (
            <option key={risk} value={risk}>
              {risk}
            </option>
          ))}
        </select>

        <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">
          Filter
        </button>
      </form>

      <div className="mt-6 space-y-3">
        {commands.map((command) => (
          <Link
            key={command.id}
            href={`/commands/${command.id}`}
            className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{command.title}</h2>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${riskBadgeClass[command.riskLevel]}`}
                >
                  {command.riskLevel}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {command.status}
                </span>
              </div>
            </div>
            <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">{command.commandText}</p>
            <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{command.description}</p>
            <p className="mt-2 text-xs text-zinc-400">
              {[command.vendor.name, command.deviceType?.name, command.technology?.name].filter(Boolean).join(" · ")}
              {" · "}
              {command.isConfigChange ? "Config change" : "Read-only"} · {command.createdBy.name}
            </p>
          </Link>
        ))}
        {commands.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
            No commands match these filters.
          </div>
        )}
      </div>
    </div>
  );
}
