"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { createCommand, findDuplicateCommand } from "@/lib/data/commands";
import { recordAudit } from "@/lib/audit";
import { createCommandSchema } from "@/lib/validation/command";

export async function createCommandAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  const parsed = createCommandSchema.safeParse({
    title: formData.get("title"),
    commandText: formData.get("commandText"),
    description: formData.get("description"),
    purpose: formData.get("purpose"),
    expectedOutput: formData.get("expectedOutput"),
    vendorId: formData.get("vendorId"),
    deviceTypeId: formData.get("deviceTypeId"),
    technologyId: formData.get("technologyId"),
    riskLevel: formData.get("riskLevel"),
    isConfigChange: formData.get("isConfigChange"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const duplicate = await findDuplicateCommand({
    vendorId: parsed.data.vendorId,
    deviceTypeId: parsed.data.deviceTypeId ?? null,
    commandText: parsed.data.commandText,
  });
  if (duplicate) {
    return "An entry for this command already exists for this vendor and device type.";
  }

  const command = await createCommand({
    title: parsed.data.title,
    commandText: parsed.data.commandText,
    description: parsed.data.description,
    purpose: parsed.data.purpose ?? null,
    expectedOutput: parsed.data.expectedOutput ?? null,
    vendorId: parsed.data.vendorId,
    deviceTypeId: parsed.data.deviceTypeId ?? null,
    technologyId: parsed.data.technologyId ?? null,
    riskLevel: parsed.data.riskLevel,
    isConfigChange: parsed.data.isConfigChange,
    createdById: user.id,
  });

  await recordAudit({
    userId: user.id,
    action: "catalog.created",
    entityType: "CommandCatalogEntry",
    entityId: command.id,
    metadata: { title: command.title, vendorId: command.vendorId },
  });

  redirect(`/commands/${command.id}`);
}
