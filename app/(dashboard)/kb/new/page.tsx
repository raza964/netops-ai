import { requireRole } from "@/lib/dal";
import { getVendorsWithDeviceTypes, getTechnologies } from "@/lib/data/reference";
import { getCaseDetail } from "@/lib/data/cases";
import { NewArticleForm } from "./new-article-form";

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ENGINEER", "ADMIN"]);
  const rawParams = await searchParams;
  const fromCaseId = typeof rawParams.fromCase === "string" ? rawParams.fromCase : undefined;

  const [vendors, technologies, sourceCase] = await Promise.all([
    getVendorsWithDeviceTypes(),
    getTechnologies(),
    fromCaseId ? getCaseDetail(fromCaseId) : Promise.resolve(null),
  ]);

  // Only pre-fill from a case that has actually been through resolution -
  // an OPEN/IN_PROGRESS case has no root cause / resolution to draw from.
  const prefill =
    sourceCase && (sourceCase.status === "RESOLVED" || sourceCase.status === "CLOSED")
      ? {
          sourceCaseId: sourceCase.id,
          title: `KB: ${sourceCase.title}`,
          summary: sourceCase.rootCause ?? "",
          content: [
            sourceCase.resolution ? `Resolution:\n${sourceCase.resolution}` : null,
            sourceCase.verification ? `Verification:\n${sourceCase.verification}` : null,
          ]
            .filter((section): section is string => Boolean(section))
            .join("\n\n"),
          vendorId: sourceCase.vendorId,
          technologyId: sourceCase.technologyId,
        }
      : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New Knowledge Base Article</h1>
      <NewArticleForm vendors={vendors} technologies={technologies} prefill={prefill} />
    </div>
  );
}
