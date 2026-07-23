import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/client";

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/** Deletes all rows from every application table, in FK-safe order. */
export async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.troubleshootingStep.deleteMany();
  await prisma.troubleshootingCase.deleteMany();
  await prisma.deviceType.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.technology.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUser(
  role: Role = "ENGINEER",
  overrides: Partial<{ isActive: boolean }> = {},
) {
  return prisma.user.create({
    data: {
      name: `Test User ${unique("u")}`,
      email: `${unique("user")}@test.local`,
      passwordHash: "unused-in-tests",
      role,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createTestCase(createdById: string) {
  const vendor = await prisma.vendor.create({ data: { name: unique("Vendor"), slug: unique("vendor") } });
  const deviceType = await prisma.deviceType.create({ data: { name: unique("Device"), vendorId: vendor.id } });
  const technology = await prisma.technology.create({ data: { name: unique("Tech"), slug: unique("tech") } });

  return prisma.troubleshootingCase.create({
    data: {
      title: unique("Case"),
      description: "Test case description, long enough to pass validation.",
      vendorId: vendor.id,
      deviceTypeId: deviceType.id,
      technologyId: technology.id,
      severity: "MEDIUM",
      createdById,
    },
  });
}
