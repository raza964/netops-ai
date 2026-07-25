import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "./env";

function createDatabaseAdapter(connectionString: string) {
  const hostname = new URL(connectionString).hostname;

  if (hostname.endsWith(".neon.tech")) {
    return new PrismaNeon({ connectionString });
  }

  return new PrismaPg({ connectionString });
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: createDatabaseAdapter(env.DATABASE_URL),
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createOperationIsolatedPrisma(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      const client = createPrismaClient();
      const value = Reflect.get(client, property);

      if (typeof value === "function") {
        return (...args: unknown[]) =>
          Promise.resolve(Reflect.apply(value, client, args)).finally(() =>
            client.$disconnect(),
          );
      }

      if (typeof value === "object" && value !== null) {
        return new Proxy(value, {
          get(delegate, method) {
            const delegateValue = Reflect.get(delegate, method);

            if (typeof delegateValue !== "function") return delegateValue;

            return (...args: unknown[]) =>
              Promise.resolve(Reflect.apply(delegateValue, delegate, args)).finally(
                () => client.$disconnect(),
              );
          },
        });
      }

      return value;
    },
  });
}

// Cloudflare prohibits reusing request-bound I/O objects from a later request.
// PrismaNeon owns a Pool, so the conventional module-level singleton can leak
// native I/O across requests in a reused Worker isolate. An operation-scoped
// client keeps every adapter, pool, transaction, and disconnect inside the
// request that initiated the ORM operation. Local development and tests retain
// a singleton to avoid unnecessary connection churn and preserve hot reload.
export const prisma =
  env.NODE_ENV === "production"
    ? createOperationIsolatedPrisma()
    : (globalForPrisma.prisma ?? createPrismaClient());

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
