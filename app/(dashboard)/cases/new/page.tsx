import { requireRole } from "@/lib/dal";
import { getVendorsWithDeviceTypes, getTechnologies } from "@/lib/data/reference";
import { NewCaseForm } from "./new-case-form";

export default async function NewCasePage() {
  await requireRole(["ENGINEER", "ADMIN"]);
  const [vendors, technologies] = await Promise.all([getVendorsWithDeviceTypes(), getTechnologies()]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New Troubleshooting Case</h1>
      <NewCaseForm vendors={vendors} technologies={technologies} />
    </div>
  );
}
