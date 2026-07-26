import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { organizeImportedDrafts } from "@/lib/data/kb-organize";

function requestHasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function POST(request: Request) {
  if (!requestHasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  return NextResponse.json(await organizeImportedDrafts());
}