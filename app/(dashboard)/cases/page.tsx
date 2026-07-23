import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { listCases } from "@/lib/data/cases";
import { getVendorsWithDeviceTypes, getTechnologies } from "@/lib/data/reference";
import { caseFilterSchema, severityValues, caseStatusValues } from "@/lib/validation/case";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const rawParams = await searchParams;

  const filterParsed = caseFilterSchema.safeParse({
    status: rawParams.status,
    vendorId: rawParams.vendorId,
    technologyId: rawParams.technologyId,
    severity: rawParams.severity,
  });
  const filter = filterParsed.success ? filterParsed.data : {};

  const [cases, vendors, technologies] = await Promise.all([
    listCases(filter),
    getVendorsWithDeviceTypes(),
    getTechnologies(),
  ]);

  const canCreate = user.role === "ADMIN" || user.role === "ENGINEER";

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Troubleshooting Cases</h1>
        {canCreate && (
          <Link
            href="/cases/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            New Case
          </Link>
        )}
      </div>

      <form method="get" className="mt-6 flex flex-wrap gap-3 text-sm">
        <select
          name="status"
          defaultValue={filter.status ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All statuses</option>
          {caseStatusValues.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select
          name="severity"
          defaultValue={filter.severity ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All severities</option>
          {severityValues.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>

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

        <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">
          Filter
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium">Technology</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Created by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {cases.map((troubleshootingCase) => (
              <tr key={troubleshootingCase.id}>
                <td className="px-4 py-2">
                  <Link
                    href={`/cases/${troubleshootingCase.id}`}
                    className="font-medium text-blue-600 dark:text-blue-400"
                  >
                    {troubleshootingCase.title}
                  </Link>
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{troubleshootingCase.vendor.name}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{troubleshootingCase.technology.name}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{troubleshootingCase.severity}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{troubleshootingCase.status}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{troubleshootingCase.createdBy.name}</td>
              </tr>
            ))}
            {cases.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-400">
                  No cases match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
