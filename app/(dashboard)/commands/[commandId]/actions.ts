"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { recordAudit } from "@/lib/audit";
import {
  archiveCommand,
  findDuplicateCommand,
  getCommandDetail,
  publishCommand,
  softDeleteCommand,
  updateCommand,
} from "@/lib/data/commands";
import { deleteCommandSchema, updateCommandSchema } from "@/lib/validation/command";
import { indexCommand, removeCommandEmbedding } from "@/lib/embeddings/indexer";

/**
 * Indexing is best-effort: a Voyage outage must never block a publish/edit
 * from succeeding, so failures are logged and swallowed here rather than
 * propagated to the caller.
 */
async function reindexCommand(commandId: string) {
  try {
    await indexCommand(commandId);
  } catch (error) {
    console.error(`Failed to index CommandCatalogEntry ${commandId} for search`, error);
  }
}

export async function updateCommandAction(commandId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  const parsed = updateCommandSchema.safeParse({
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
    excludeId: commandId,
  });
  if (duplicate) {
    return "An entry for this command already exists for this vendor and device type.";
  }

  await updateCommand({
    commandId,
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
    updatedById: user.id,
  });

  await recordAudit({
    userId: user.id,
    action: "catalog.updated",
    entityType: "CommandCatalogEntry",
    entityId: commandId,
    metadata: { title: parsed.data.title },
  });

  await reindexCommand(commandId);

  redirect(`/commands/${commandId}`);
}

export async function publishCommandAction(commandId: string) {
  const user = await requireRole(["ADMIN"]);

  await publishCommand(commandId);

  await recordAudit({
    userId: user.id,
    action: "catalog.published",
    entityType: "CommandCatalogEntry",
    entityId: commandId,
    metadata: {},
  });

  await reindexCommand(commandId);

  revalidatePath(`/commands/${commandId}`);
}

export async function archiveCommandAction(commandId: string) {
  const user = await requireRole(["ADMIN"]);

  await archiveCommand(commandId);

  await recordAudit({
    userId: user.id,
    action: "catalog.archived",
    entityType: "CommandCatalogEntry",
    entityId: commandId,
    metadata: {},
  });

  await removeCommandEmbedding(commandId);

  revalidatePath(`/commands/${commandId}`);
}

export async function softDeleteCommandAction(commandId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const command = await getCommandDetail(commandId);
  if (!command) {
    throw new Error("Command not found.");
  }

  const parsed = deleteCommandSchema.safeParse({ confirmation: formData.get("confirmation") });
  if (!parsed.success || parsed.data.confirmation !== command.title) {
    return "Confirmation text does not match the command title.";
  }

  await softDeleteCommand(commandId);

  await recordAudit({
    userId: user.id,
    action: "catalog.soft_deleted",
    entityType: "CommandCatalogEntry",
    entityId: commandId,
    metadata: { title: command.title },
  });

  await removeCommandEmbedding(commandId);

  redirect("/commands");
}
