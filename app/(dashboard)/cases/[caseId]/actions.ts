"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { recordAudit } from "@/lib/audit";
import {
  addAiAnalysisSteps,
  addCommandStep,
  addNoteStep,
  changeCaseStatus,
  decideStep,
  getCaseDetail,
  getStep,
  resolveCase,
  softDeleteCase,
} from "@/lib/data/cases";
import { analyzeCase } from "@/lib/ai/case-analysis";
import { AiProviderError } from "@/lib/ai/provider";
import { addCommandStepSchema, addNoteStepSchema, deleteCaseSchema, resolveCaseSchema } from "@/lib/validation/case";

export async function addCommandStepAction(caseId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  const parsed = addCommandStepSchema.safeParse({
    commandText: formData.get("commandText"),
    commandOutput: formData.get("commandOutput"),
    isConfigChange: formData.get("isConfigChange"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const step = await addCommandStep({
    caseId,
    commandText: parsed.data.commandText,
    commandOutput: parsed.data.commandOutput || null,
    isConfigChange: parsed.data.isConfigChange,
    performedById: user.id,
  });

  await recordAudit({
    userId: user.id,
    action: "step.command_logged",
    entityType: "TroubleshootingStep",
    entityId: step.id,
    metadata: { caseId, isConfigChange: parsed.data.isConfigChange },
  });

  revalidatePath(`/cases/${caseId}`);
}

export async function addNoteStepAction(caseId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  const parsed = addNoteStepSchema.safeParse({ note: formData.get("note") });
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  const step = await addNoteStep({ caseId, note: parsed.data.note, performedById: user.id });

  await recordAudit({
    userId: user.id,
    action: "step.note_logged",
    entityType: "TroubleshootingStep",
    entityId: step.id,
    metadata: { caseId },
  });

  revalidatePath(`/cases/${caseId}`);
}

export async function generateAiAnalysisAction(caseId: string): Promise<string | undefined> {
  const user = await requireRole(["ENGINEER", "ADMIN"]);
  const troubleshootingCase = await getCaseDetail(caseId);
  if (!troubleshootingCase) return "Case not found.";
  if (troubleshootingCase.status === "CLOSED") return "Closed cases cannot be analyzed.";

  try {
    const result = await analyzeCase(troubleshootingCase);
    const steps = await addAiAnalysisSteps({
      caseId,
      analysis: result.analysis,
      recommendedNextStep: result.recommendedNextStep,
      aiModel: result.model,
      performedById: user.id,
    });
    await recordAudit({
      userId: user.id,
      action: "case.ai_analysis_generated",
      entityType: "TroubleshootingCase",
      entityId: caseId,
      metadata: {
        model: result.model,
        analysisStepId: steps.analysisStep.id,
        recommendationStepId: steps.recommendationStep.id,
      },
    });
    revalidatePath(`/cases/${caseId}`);
  } catch (error) {
    if (error instanceof AiProviderError) return error.message;
    throw error;
  }
}

export async function decideStepAction(caseId: string, stepId: string, decision: "APPROVED" | "REJECTED") {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  const step = await getStep(stepId);
  if (!step || step.caseId !== caseId) {
    throw new Error("Step not found.");
  }
  if (step.performedById === user.id) {
    throw new Error("You cannot approve or reject your own command.");
  }

  await decideStep({ stepId, decision, approvedById: user.id });

  await recordAudit({
    userId: user.id,
    action: decision === "APPROVED" ? "step.approved" : "step.rejected",
    entityType: "TroubleshootingStep",
    entityId: stepId,
    metadata: { caseId },
  });

  revalidatePath(`/cases/${caseId}`);
}

export async function startCaseAction(caseId: string) {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  await changeCaseStatus({ caseId, toStatus: "IN_PROGRESS", performedById: user.id });

  await recordAudit({
    userId: user.id,
    action: "case.status_changed",
    entityType: "TroubleshootingCase",
    entityId: caseId,
    metadata: { toStatus: "IN_PROGRESS" },
  });

  revalidatePath(`/cases/${caseId}`);
}

export async function resolveCaseAction(caseId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  const parsed = resolveCaseSchema.safeParse({
    rootCause: formData.get("rootCause"),
    resolution: formData.get("resolution"),
    verification: formData.get("verification"),
  });

  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid input.";
  }

  await resolveCase({ caseId, ...parsed.data, performedById: user.id });

  await recordAudit({
    userId: user.id,
    action: "case.resolved",
    entityType: "TroubleshootingCase",
    entityId: caseId,
    metadata: {},
  });

  revalidatePath(`/cases/${caseId}`);
}

export async function closeCaseAction(caseId: string) {
  const user = await requireRole(["ENGINEER", "ADMIN"]);

  await changeCaseStatus({ caseId, toStatus: "CLOSED", performedById: user.id });

  await recordAudit({
    userId: user.id,
    action: "case.closed",
    entityType: "TroubleshootingCase",
    entityId: caseId,
    metadata: {},
  });

  revalidatePath(`/cases/${caseId}`);
}

export async function softDeleteCaseAction(caseId: string, _prevState: string | undefined, formData: FormData) {
  const user = await requireRole(["ADMIN"]);

  const troubleshootingCase = await getCaseDetail(caseId);
  if (!troubleshootingCase) {
    throw new Error("Case not found.");
  }

  const parsed = deleteCaseSchema.safeParse({ confirmation: formData.get("confirmation") });
  if (!parsed.success || parsed.data.confirmation !== troubleshootingCase.title) {
    return "Confirmation text does not match the case title.";
  }

  await softDeleteCase(caseId);

  await recordAudit({
    userId: user.id,
    action: "case.soft_deleted",
    entityType: "TroubleshootingCase",
    entityId: caseId,
    metadata: { title: troubleshootingCase.title },
  });

  redirect("/cases");
}
