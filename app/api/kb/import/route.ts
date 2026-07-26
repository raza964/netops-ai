import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { importKnowledgeBatch } from "@/lib/data/kb-import";
import { kbImportBatchSchema } from "@/lib/validation/kb-import";

function requestHasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

function requestHasImportToken(request: Request): boolean {
  const expected = env.KB_IMPORT_TOKEN;
  const authorization = request.headers.get("authorization");
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  const machineAuthorized = requestHasImportToken(request);
  const session = machineAuthorized ? null : await auth();
  if (!machineAuthorized && (!requestHasTrustedOrigin(request) || !session?.user?.id || session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const importingUserId = session?.user?.id ?? (
    await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
  )?.id;
  if (!importingUserId) {
    return NextResponse.json({ error: "No active administrator is available for import attribution." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = kbImportBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid import payload." },
      { status: 400 },
    );
  }

  const result = await importKnowledgeBatch(parsed.data, importingUserId);
  return NextResponse.json(result, { status: result.failed.length > 0 ? 207 : 200 });
}
