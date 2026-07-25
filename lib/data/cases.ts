import "server-only";
import { prisma } from "../db";
import type { CaseStatus, Severity } from "@prisma/client";

export type CaseListFilter = {
  status?: CaseStatus;
  vendorId?: string;
  technologyId?: string;
  severity?: Severity;
};

export async function listCases(filter: CaseListFilter) {
  return prisma.troubleshootingCase.findMany({
    where: {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.vendorId ? { vendorId: filter.vendorId } : {}),
      ...(filter.technologyId ? { technologyId: filter.technologyId } : {}),
      ...(filter.severity ? { severity: filter.severity } : {}),
    },
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      createdAt: true,
      vendor: { select: { name: true } },
      technology: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCaseDetail(caseId: string) {
  return prisma.troubleshootingCase.findFirst({
    where: { id: caseId, deletedAt: null },
    include: {
      vendor: true,
      deviceType: true,
      technology: true,
      createdBy: { select: { id: true, name: true } },
      steps: {
        orderBy: { createdAt: "asc" },
        include: {
          performedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function createCase(input: {
  title: string;
  description: string;
  vendorId: string;
  deviceTypeId: string;
  technologyId: string;
  severity: Severity;
  createdById: string;
}) {
  return prisma.troubleshootingCase.create({ data: input });
}

export async function addCommandStep(input: {
  caseId: string;
  commandText: string;
  commandOutput: string | null;
  isConfigChange: boolean;
  performedById: string;
}) {
  return prisma.troubleshootingStep.create({
    data: {
      caseId: input.caseId,
      type: "COMMAND",
      commandText: input.commandText,
      commandOutput: input.commandOutput,
      isConfigChange: input.isConfigChange,
      approvalState: input.isConfigChange ? "PENDING" : "NOT_REQUIRED",
      performedById: input.performedById,
    },
  });
}

export async function addNoteStep(input: { caseId: string; note: string; performedById: string }) {
  return prisma.troubleshootingStep.create({
    data: {
      caseId: input.caseId,
      type: "NOTE",
      note: input.note,
      performedById: input.performedById,
    },
  });
}

export async function addAiAnalysisSteps(input: {
  caseId: string;
  analysis: string;
  recommendedNextStep: string;
  aiModel: string;
  performedById: string;
}) {
  return prisma.$transaction(async (tx) => {
    const analysisStep = await tx.troubleshootingStep.create({
      data: {
        caseId: input.caseId,
        type: "AI_ANALYSIS",
        aiAnalysis: input.analysis,
        aiModel: input.aiModel,
        performedById: input.performedById,
      },
    });
    const recommendationStep = await tx.troubleshootingStep.create({
      data: {
        caseId: input.caseId,
        type: "NEXT_STEP_RECOMMENDATION",
        recommendedNextStep: input.recommendedNextStep,
        aiModel: input.aiModel,
        performedById: input.performedById,
      },
    });
    return { analysisStep, recommendationStep };
  });
}

export async function getStep(stepId: string) {
  return prisma.troubleshootingStep.findUnique({
    where: { id: stepId },
    select: { id: true, caseId: true, performedById: true, approvalState: true },
  });
}

export async function decideStep(input: {
  stepId: string;
  decision: "APPROVED" | "REJECTED";
  approvedById: string;
}) {
  return prisma.troubleshootingStep.update({
    where: { id: input.stepId },
    data: {
      approvalState: input.decision,
      approvedById: input.approvedById,
      approvedAt: new Date(),
    },
  });
}

/**
 * Updates the case status and appends a STATUS_CHANGE timeline entry in the
 * same transaction, so the audit trail can never disagree with the case row.
 */
export async function changeCaseStatus(input: {
  caseId: string;
  toStatus: CaseStatus;
  performedById: string;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.troubleshootingCase.findUniqueOrThrow({
      where: { id: input.caseId },
      select: { status: true },
    });

    const updated = await tx.troubleshootingCase.update({
      where: { id: input.caseId },
      data: { status: input.toStatus },
    });

    await tx.troubleshootingStep.create({
      data: {
        caseId: input.caseId,
        type: "STATUS_CHANGE",
        note: `Status changed from ${current.status} to ${input.toStatus}`,
        performedById: input.performedById,
      },
    });

    return updated;
  });
}

export async function resolveCase(input: {
  caseId: string;
  rootCause: string;
  resolution: string;
  verification: string;
  performedById: string;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.troubleshootingCase.findUniqueOrThrow({
      where: { id: input.caseId },
      select: { status: true },
    });

    const updated = await tx.troubleshootingCase.update({
      where: { id: input.caseId },
      data: {
        status: "RESOLVED",
        rootCause: input.rootCause,
        resolution: input.resolution,
        verification: input.verification,
        resolvedAt: new Date(),
      },
    });

    await tx.troubleshootingStep.create({
      data: {
        caseId: input.caseId,
        type: "STATUS_CHANGE",
        note: `Status changed from ${current.status} to RESOLVED`,
        performedById: input.performedById,
      },
    });

    return updated;
  });
}

export async function softDeleteCase(caseId: string) {
  return prisma.troubleshootingCase.update({
    where: { id: caseId },
    data: { deletedAt: new Date() },
  });
}
