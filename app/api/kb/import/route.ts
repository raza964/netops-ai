import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { importKnowledgeBatch } from "@/lib/data/kb-import";
import { kbImportBatchSchema } from "@/lib/validation/kb-import";

function requestHasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!requestHasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
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

  const result = await importKnowledgeBatch(parsed.data, session.user.id);
  return NextResponse.json(result, { status: result.failed.length > 0 ? 207 : 200 });
}
