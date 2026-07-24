import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { getCommandDetail } from "@/lib/data/commands";
import { getVendorsWithDeviceTypes, getTechnologies } from "@/lib/data/reference";
import { EditCommandForm } from "./edit-command-form";

export default async function EditCommandPage({ params }: { params: Promise<{ commandId: string }> }) {
  await requireRole(["ENGINEER", "ADMIN"]);
  const { commandId } = await params;

  const [command, vendors, technologies] = await Promise.all([
    getCommandDetail(commandId),
    getVendorsWithDeviceTypes(),
    getTechnologies(),
  ]);

  if (!command) {
    notFound();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Edit Command</h1>
      <EditCommandForm command={command} vendors={vendors} technologies={technologies} />
    </div>
  );
}
