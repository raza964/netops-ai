import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { softDeleteCaseAction } from "@/app/(dashboard)/cases/[caseId]/actions";
import { mockSessionState } from "./setup";
import { createTestCase, createTestUser } from "./helpers/db";

function asUser(user: { id: string; role: string }) {
  mockSessionState.current = { user: { id: user.id, role: user.role } };
}

function confirmationFormData(confirmation: string) {
  const data = new FormData();
  data.set("confirmation", confirmation);
  return data;
}

describe("soft-delete case", () => {
  it("blocks a non-admin engineer, even with the exact title", async () => {
    const admin = await createTestUser("ADMIN");
    const engineer = await createTestUser("ENGINEER");
    const troubleshootingCase = await createTestCase(admin.id);

    asUser(engineer);
    await expect(
      softDeleteCaseAction(troubleshootingCase.id, undefined, confirmationFormData(troubleshootingCase.title)),
    ).rejects.toEqual(expect.objectContaining({ digest: expect.stringContaining("NEXT_REDIRECT;replace;/dashboard") }));

    const stillPresent = await prisma.troubleshootingCase.findUniqueOrThrow({ where: { id: troubleshootingCase.id } });
    expect(stillPresent.deletedAt).toBeNull();
  });

  it("rejects an admin's confirmation text that doesn't exactly match the case title", async () => {
    const admin = await createTestUser("ADMIN");
    const troubleshootingCase = await createTestCase(admin.id);

    asUser(admin);
    const result = await softDeleteCaseAction(
      troubleshootingCase.id,
      undefined,
      confirmationFormData(`${troubleshootingCase.title}-typo`), // genuinely different, not just whitespace
    );

    expect(result).toBe("Confirmation text does not match the case title.");
    const stillPresent = await prisma.troubleshootingCase.findUniqueOrThrow({ where: { id: troubleshootingCase.id } });
    expect(stillPresent.deletedAt).toBeNull();
  });

  it("rejects a blank confirmation", async () => {
    const admin = await createTestUser("ADMIN");
    const troubleshootingCase = await createTestCase(admin.id);

    asUser(admin);
    // Blank fails the schema's min(1) check; the action collapses every
    // parse failure into the same generic mismatch message (see
    // app/(dashboard)/cases/[caseId]/actions.ts) rather than surfacing
    // per-field validation errors like the other actions do.
    const result = await softDeleteCaseAction(troubleshootingCase.id, undefined, confirmationFormData(""));

    expect(result).toBe("Confirmation text does not match the case title.");
    const stillPresent = await prisma.troubleshootingCase.findUniqueOrThrow({ where: { id: troubleshootingCase.id } });
    expect(stillPresent.deletedAt).toBeNull();
  });

  it("soft-deletes the case when an admin confirms with the exact title", async () => {
    const admin = await createTestUser("ADMIN");
    const troubleshootingCase = await createTestCase(admin.id);

    asUser(admin);
    await expect(
      softDeleteCaseAction(troubleshootingCase.id, undefined, confirmationFormData(troubleshootingCase.title)),
    ).rejects.toEqual(expect.objectContaining({ digest: expect.stringContaining("NEXT_REDIRECT;replace;/cases;") }));

    const deleted = await prisma.troubleshootingCase.findUniqueOrThrow({ where: { id: troubleshootingCase.id } });
    expect(deleted.deletedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: troubleshootingCase.id, action: "case.soft_deleted" },
    });
    expect(audit.userId).toBe(admin.id);
  });
});
