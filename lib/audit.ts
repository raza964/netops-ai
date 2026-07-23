import "server-only";
import { headers } from "next/headers";
import { prisma } from "./db";
import type { Prisma } from "../generated/prisma/client";

export async function recordAudit(input: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonObject;
}) {
  const headersList = await headers();
  const ipAddress = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      ipAddress,
    },
  });
}
