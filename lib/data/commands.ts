import "server-only";
import { prisma } from "../db";
import { slugify } from "../slug";
import type { CommandStatus, RiskLevel } from "../../generated/prisma/client";

export type CommandListFilter = {
  // Caller decides which statuses are visible for the current role (e.g. a
  // VIEWER only ever passes ["PUBLISHED"]) - the DAL does not enforce RBAC.
  statuses: CommandStatus[];
  vendorId?: string;
  deviceTypeId?: string;
  technologyId?: string;
  riskLevel?: RiskLevel;
  isConfigChange?: boolean;
  query?: string;
};

export async function listCommands(filter: CommandListFilter) {
  return prisma.commandCatalogEntry.findMany({
    where: {
      deletedAt: null,
      status: { in: filter.statuses },
      ...(filter.vendorId ? { vendorId: filter.vendorId } : {}),
      ...(filter.deviceTypeId ? { deviceTypeId: filter.deviceTypeId } : {}),
      ...(filter.technologyId ? { technologyId: filter.technologyId } : {}),
      ...(filter.riskLevel ? { riskLevel: filter.riskLevel } : {}),
      ...(filter.isConfigChange !== undefined ? { isConfigChange: filter.isConfigChange } : {}),
      ...(filter.query
        ? {
            OR: [
              { title: { contains: filter.query, mode: "insensitive" as const } },
              { commandText: { contains: filter.query, mode: "insensitive" as const } },
              { description: { contains: filter.query, mode: "insensitive" as const } },
              { purpose: { contains: filter.query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      commandText: true,
      description: true,
      riskLevel: true,
      isConfigChange: true,
      status: true,
      createdAt: true,
      vendor: { select: { name: true } },
      deviceType: { select: { name: true } },
      technology: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCommandDetail(commandId: string) {
  return prisma.commandCatalogEntry.findFirst({
    where: { id: commandId, deletedAt: null },
    include: {
      vendor: true,
      deviceType: true,
      technology: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });
}

function normalizeCommandText(commandText: string): string {
  return commandText.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * A "duplicate" is the same command text for the same vendor + device type
 * (whitespace/case-insensitive). deviceTypeId is nullable, and Postgres
 * unique indexes treat NULL as distinct from NULL, so this is enforced here
 * rather than with a DB constraint.
 */
export async function findDuplicateCommand(input: {
  vendorId: string;
  deviceTypeId: string | null;
  commandText: string;
  excludeId?: string;
}) {
  const normalized = normalizeCommandText(input.commandText);
  const candidates = await prisma.commandCatalogEntry.findMany({
    where: {
      vendorId: input.vendorId,
      deviceTypeId: input.deviceTypeId,
      deletedAt: null,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true, commandText: true },
  });
  return candidates.find((candidate) => normalizeCommandText(candidate.commandText) === normalized) ?? null;
}

async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "command";
  let candidate = base;
  let suffix = 1;
  while (await prisma.commandCatalogEntry.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

export async function createCommand(input: {
  title: string;
  commandText: string;
  description: string;
  purpose: string | null;
  expectedOutput: string | null;
  vendorId: string;
  deviceTypeId: string | null;
  technologyId: string | null;
  riskLevel: RiskLevel;
  isConfigChange: boolean;
  createdById: string;
}) {
  const slug = await generateUniqueSlug(input.title);
  return prisma.commandCatalogEntry.create({ data: { ...input, slug } });
}

/**
 * Slug is intentionally immutable once created, so existing links to a
 * command keep working even after its title is edited.
 */
export async function updateCommand(input: {
  commandId: string;
  title: string;
  commandText: string;
  description: string;
  purpose: string | null;
  expectedOutput: string | null;
  vendorId: string;
  deviceTypeId: string | null;
  technologyId: string | null;
  riskLevel: RiskLevel;
  isConfigChange: boolean;
  updatedById: string;
}) {
  const { commandId, ...data } = input;
  return prisma.commandCatalogEntry.update({ where: { id: commandId }, data });
}

export async function publishCommand(commandId: string) {
  return prisma.commandCatalogEntry.update({ where: { id: commandId }, data: { status: "PUBLISHED" } });
}

export async function archiveCommand(commandId: string) {
  return prisma.commandCatalogEntry.update({ where: { id: commandId }, data: { status: "ARCHIVED" } });
}

export async function softDeleteCommand(commandId: string) {
  return prisma.commandCatalogEntry.update({ where: { id: commandId }, data: { deletedAt: new Date() } });
}
