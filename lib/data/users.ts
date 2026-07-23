import "server-only";
import { prisma } from "../db";

/**
 * Returns the full user row, including passwordHash. Only ever used
 * internally by the Auth.js `authorize()` callback for credential
 * verification - never return this value directly to a caller.
 */
export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
}

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}
