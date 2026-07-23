import { afterAll, afterEach, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "./helpers/db";

// Shared, mutable "current session" the mocked `auth()` below reads from.
// Tests set this via mockSessionState.current before calling DAL/actions.
export const mockSessionState: { current: { user: { id: string; role: string } } | null } = {
  current: null,
};

// `server-only` resolves its "default" export condition (index.js, which
// throws) unless bundled by Next with its "react-server" condition active
// (which maps it to a no-op empty.js). Plain Node/Vite has no such
// condition, so every "server-only" import would throw here unless mocked.
vi.mock("server-only", () => ({}));

// lib/dal.ts imports `auth` from "./auth" (== "@/lib/auth"). Mocking it lets
// us drive session state per-test without going through real Auth.js/JWTs.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => mockSessionState.current),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

// headers() and revalidatePath() both throw when called outside a real
// Next.js request (no request/work store present) - see
// node_modules/next/dist/server/request/headers.js and .../revalidate.js.
// recordAudit() and several server actions call these, so they're mocked
// with harmless stand-ins. next/navigation's redirect() is intentionally
// left real: it throws a NEXT_REDIRECT error with no request store either,
// which is exactly the behavior the role-gating tests assert on.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  mockSessionState.current = null;
  vi.clearAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});
