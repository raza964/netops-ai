"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { createCase } from "@/lib/data/cases";
import { recordAudit } from "@/lib/audit";
import { createCaseSchema } from "@/lib/validation/case";

export async function createCaseAction(_prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  const parsed = createCaseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    vendorId: formData.get("vendorId"),
    deviceTypeId: formData.get("deviceTypeId"),
    technologyId: formData.get("technologyId"),
    severity: formData.get("severity"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const troubleshootingCase = await createCase({ ...parsed.data, createdById: user.id });

  await recordAudit({
    userId: user.id,
    action: "case.created",
    entityType: "TroubleshootingCase",
    entityId: troubleshootingCase.id,
    metadata: { title: troubleshootingCase.title, severity: troubleshootingCase.severity },
  });

  redirect(`/cases/${troubleshootingCase.id}`);
}
