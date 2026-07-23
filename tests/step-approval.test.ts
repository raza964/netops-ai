import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addCommandStepAction, decideStepAction } from "@/app/(dashboard)/cases/[caseId]/actions";
import { mockSessionState } from "./setup";
import { createTestCase, createTestUser } from "./helpers/db";

function asUser(user: { id: string; role: string }) {
  mockSessionState.current = { user: { id: user.id, role: user.role } };
}

function configChangeFormData() {
  const data = new FormData();
  data.set("commandText", "configure terminal");
  data.set("commandOutput", "");
  data.set("isConfigChange", "true");
  return data;
}

async function loggedConfigChangeStep(performer: { id: string; role: string }, caseId: string) {
  asUser(performer);
  await addCommandStepAction(caseId, undefined, configChangeFormData());
  return prisma.troubleshootingStep.findFirstOrThrow({ where: { caseId } });
}

describe("config-change step approval", () => {
  it("logs a config-changing command as PENDING approval", async () => {
    const engineer = await createTestUser("ENGINEER");
    const troubleshootingCase = await createTestCase(engineer.id);

    const step = await loggedConfigChangeStep(engineer, troubleshootingCase.id);

    expect(step.isConfigChange).toBe(true);
    expect(step.approvalState).toBe("PENDING");
  });

  it("rejects a user approving their own config-changing command", async () => {
    const engineer = await createTestUser("ENGINEER");
    const troubleshootingCase = await createTestCase(engineer.id);
    const step = await loggedConfigChangeStep(engineer, troubleshootingCase.id);

    asUser(engineer);
    await expect(decideStepAction(troubleshootingCase.id, step.id, "APPROVED")).rejects.toThrow(
      "You cannot approve or reject your own command.",
    );

    const unchanged = await prisma.troubleshootingStep.findUniqueOrThrow({ where: { id: step.id } });
    expect(unchanged.approvalState).toBe("PENDING");
    expect(unchanged.approvedById).toBeNull();
  });

  it("rejects a user rejecting their own config-changing command", async () => {
    const engineer = await createTestUser("ENGINEER");
    const troubleshootingCase = await createTestCase(engineer.id);
    const step = await loggedConfigChangeStep(engineer, troubleshootingCase.id);

    asUser(engineer);
    await expect(decideStepAction(troubleshootingCase.id, step.id, "REJECTED")).rejects.toThrow(
      "You cannot approve or reject your own command.",
    );
  });

  it("allows a different authorized user to approve the command", async () => {
    const engineer = await createTestUser("ENGINEER");
    const approver = await createTestUser("ADMIN");
    const troubleshootingCase = await createTestCase(engineer.id);
    const step = await loggedConfigChangeStep(engineer, troubleshootingCase.id);

    asUser(approver);
    await decideStepAction(troubleshootingCase.id, step.id, "APPROVED");

    const approved = await prisma.troubleshootingStep.findUniqueOrThrow({ where: { id: step.id } });
    expect(approved.approvalState).toBe("APPROVED");
    expect(approved.approvedById).toBe(approver.id);
    expect(approved.approvedAt).not.toBeNull();
  });

  it("allows a different authorized user to reject the command", async () => {
    const engineer = await createTestUser("ENGINEER");
    const approver = await createTestUser("ENGINEER");
    const troubleshootingCase = await createTestCase(engineer.id);
    const step = await loggedConfigChangeStep(engineer, troubleshootingCase.id);

    asUser(approver);
    await decideStepAction(troubleshootingCase.id, step.id, "REJECTED");

    const rejected = await prisma.troubleshootingStep.findUniqueOrThrow({ where: { id: step.id } });
    expect(rejected.approvalState).toBe("REJECTED");
    expect(rejected.approvedById).toBe(approver.id);
  });
});
