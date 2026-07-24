import { requireRole } from "@/lib/dal";
import { getVendorsWithDeviceTypes, getTechnologies } from "@/lib/data/reference";
import { NewCommandForm } from "./new-command-form";

export default async function NewCommandPage() {
  await requireRole(["ENGINEER", "ADMIN"]);

  const [vendors, technologies] = await Promise.all([getVendorsWithDeviceTypes(), getTechnologies()]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New Command</h1>
      <NewCommandForm vendors={vendors} technologies={technologies} />
    </div>
  );
}
