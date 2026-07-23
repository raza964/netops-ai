import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./db";
import type { Role } from "../generated/prisma/client";

/**
 * Verifies the Auth.js JWT and returns the minimal session identity.
 * Memoized per request with React `cache()` so repeated calls in the
 * same render pass don't redo the work.
 */
export const verifySession = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return { userId: session.user.id, role: session.user.role };
});

/**
 * Re-reads the user from the database rather than trusting the JWT's
 * cached role/active-status claims, so a role change or deactivation
 * takes effect immediately instead of waiting for token refresh.
 */
export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    redirect("/login");
  }

  return user;
});

export async function requireRole(allowedRoles: Role[]) {
  const user = await getCurrentUser();
  if (!allowedRoles.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}
