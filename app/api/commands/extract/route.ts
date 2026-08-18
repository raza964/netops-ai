import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ingestCommandsFromArticles } from "@/lib/data/command-ingestion";
import { z } from "zod";

const requestSchema = z.object({
  articleIds: z.array(z.string()).max(20).optional(),
  cursor: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const result = await ingestCommandsFromArticles({
    createdById: session.user.id,
    articleIds: parsed.data.articleIds,
    cursor: parsed.data.cursor,
  });
  return NextResponse.json(result, { status: result.failed.length ? 207 : 200 });
}
