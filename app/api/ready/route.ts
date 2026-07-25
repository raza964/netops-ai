import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function sanitizeDatabaseError(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://[redacted]@")
    .slice(0, 500);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  return { name, code, message };
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      {
        status: "ready",
        database: "reachable",
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "Database readiness check failed",
      sanitizeDatabaseError(error),
    );

    return Response.json(
      {
        status: "not_ready",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "30",
        },
      },
    );
  }
}
