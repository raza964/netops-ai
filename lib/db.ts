import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "./env";

function createDatabaseAdapter(connectionString: string) {
  const hostname = new URL(connectionString).hostname;

  if (hostname.endsWith(".neon.tech")) {
    return new PrismaNeon({ connectionString });
  }

  return new PrismaPg({ connectionString });
}

const adapter = createDatabaseAdapter(env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
