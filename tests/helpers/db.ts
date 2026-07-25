import { prisma } from "@/lib/db";
import type { ArticleStatus, CommandStatus, RiskLevel, Role } from "@prisma/client";

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/** Deletes all rows from every application table, in FK-safe order. */
export async function resetDatabase() {
  await prisma.contentEmbedding.deleteMany();
  await prisma.knowledgeBaseArticle.deleteMany();
  await prisma.commandCatalogEntry.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.troubleshootingStep.deleteMany();
  await prisma.troubleshootingCase.deleteMany();
  await prisma.deviceType.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.technology.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestVendor() {
  return prisma.vendor.create({ data: { name: unique("Vendor"), slug: unique("vendor") } });
}

export async function createTestDeviceType(vendorId: string) {
  return prisma.deviceType.create({ data: { name: unique("Device"), vendorId } });
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

export async function createTestCommand(
  createdById: string,
  overrides: Partial<{
    status: CommandStatus;
    riskLevel: RiskLevel;
    isConfigChange: boolean;
    vendorId: string;
    deviceTypeId: string | null;
    technologyId: string | null;
    title: string;
    commandText: string;
    description: string;
    purpose: string | null;
    expectedOutput: string | null;
  }> = {},
) {
  const vendorId = overrides.vendorId ?? (await createTestVendor()).id;
  const title = overrides.title ?? unique("Command");
  return prisma.commandCatalogEntry.create({
    data: {
      title,
      slug: unique("command"),
      commandText: overrides.commandText ?? "show version",
      description: overrides.description ?? "Test description, long enough to pass validation.",
      purpose: overrides.purpose ?? null,
      expectedOutput: overrides.expectedOutput ?? null,
      status: overrides.status ?? "DRAFT",
      riskLevel: overrides.riskLevel ?? "LOW",
      isConfigChange: overrides.isConfigChange ?? false,
      vendorId,
      deviceTypeId: overrides.deviceTypeId ?? null,
      technologyId: overrides.technologyId ?? null,
      createdById,
    },
  });
}

export async function createTestArticle(
  createdById: string,
  overrides: Partial<{
    status: ArticleStatus;
    vendorId: string | null;
    technologyId: string | null;
    sourceCaseId: string | null;
    title: string;
    summary: string;
    content: string;
  }> = {},
) {
  const title = overrides.title ?? unique("Article");
  return prisma.knowledgeBaseArticle.create({
    data: {
      title,
      slug: unique("article"),
      summary: overrides.summary ?? "Test summary, long enough to pass validation.",
      content: overrides.content ?? "Test content body, long enough to pass validation checks easily.",
      status: overrides.status ?? "DRAFT",
      vendorId: overrides.vendorId ?? null,
      technologyId: overrides.technologyId ?? null,
      sourceCaseId: overrides.sourceCaseId ?? null,
      createdById,
    },
  });
}
