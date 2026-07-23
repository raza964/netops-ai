import { describe, expect, it } from "vitest";
import { getCurrentUser, requireRole, verifySession } from "@/lib/dal";
import { mockSessionState } from "./setup";
import { createTestUser } from "./helpers/db";

function redirectingTo(path: string) {
  return expect.objectContaining({ digest: expect.stringContaining(`NEXT_REDIRECT;replace;${path}`) });
}

describe("verifySession", () => {
  it("redirects to /login when there is no session", async () => {
    mockSessionState.current = null;
    await expect(verifySession()).rejects.toEqual(redirectingTo("/login"));
  });
});

describe("getCurrentUser", () => {
  it("redirects to /login when the session user has been deactivated", async () => {
    const user = await createTestUser("ENGINEER", { isActive: false });
    mockSessionState.current = { user: { id: user.id, role: user.role } };

    await expect(getCurrentUser()).rejects.toEqual(redirectingTo("/login"));
  });

  it("redirects to /login when the session user no longer exists", async () => {
    mockSessionState.current = { user: { id: "does-not-exist", role: "ENGINEER" } };
    await expect(getCurrentUser()).rejects.toEqual(redirectingTo("/login"));
  });

  it("re-reads the user from the database rather than trusting the session claim", async () => {
    const user = await createTestUser("VIEWER");
    // Session claims ADMIN, but the DB row (source of truth) says VIEWER.
    mockSessionState.current = { user: { id: user.id, role: "ADMIN" } };

    const result = await getCurrentUser();
    expect(result.role).toBe("VIEWER");
  });
});

describe("requireRole", () => {
  it("redirects to /dashboard when the user's role is not in the allowed list", async () => {
    const engineer = await createTestUser("ENGINEER");
    mockSessionState.current = { user: { id: engineer.id, role: engineer.role } };

    await expect(requireRole(["ADMIN"])).rejects.toEqual(redirectingTo("/dashboard"));
  });

  it("returns the user when their role is in the allowed list", async () => {
    const admin = await createTestUser("ADMIN");
    mockSessionState.current = { user: { id: admin.id, role: admin.role } };

    const result = await requireRole(["ADMIN"]);
    expect(result.id).toBe(admin.id);
  });

  it("allows any role in a multi-role list", async () => {
    const engineer = await createTestUser("ENGINEER");
    mockSessionState.current = { user: { id: engineer.id, role: engineer.role } };

    const result = await requireRole(["ENGINEER", "ADMIN"]);
    expect(result.id).toBe(engineer.id);
  });
});
