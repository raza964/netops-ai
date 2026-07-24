import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createCommandAction } from "@/app/(dashboard)/commands/actions";
import {
  archiveCommandAction,
  publishCommandAction,
  softDeleteCommandAction,
  updateCommandAction,
} from "@/app/(dashboard)/commands/[commandId]/actions";
import { listCommands } from "@/lib/data/commands";
import { mockSessionState } from "./setup";
import { createTestCommand, createTestDeviceType, createTestUser, createTestVendor } from "./helpers/db";

function asUser(user: { id: string; role: string }) {
  mockSessionState.current = { user: { id: user.id, role: user.role } };
}

function noSession() {
  mockSessionState.current = null;
}

function redirectingTo(path: string) {
  return expect.objectContaining({ digest: expect.stringContaining(`NEXT_REDIRECT;replace;${path}`) });
}

function createCommandFormData(
  vendorId: string,
  overrides: Partial<
    Record<"title" | "commandText" | "description" | "deviceTypeId" | "technologyId" | "riskLevel", string>
  > = {},
) {
  const data = new FormData();
  data.set("title", overrides.title ?? "Check BGP Session Summary");
  data.set("commandText", overrides.commandText ?? "show ip bgp summary");
  data.set(
    "description",
    overrides.description ?? "Displays a summary of all configured BGP peers and their session state.",
  );
  data.set("vendorId", vendorId);
  if (overrides.deviceTypeId) data.set("deviceTypeId", overrides.deviceTypeId);
  if (overrides.technologyId) data.set("technologyId", overrides.technologyId);
  data.set("riskLevel", overrides.riskLevel ?? "LOW");
  return data;
}

function confirmationFormData(confirmation: string) {
  const data = new FormData();
  data.set("confirmation", confirmation);
  return data;
}

describe("createCommandAction", () => {
  it("redirects to /login when there is no session", async () => {
    noSession();
    const vendor = await createTestVendor();

    await expect(createCommandAction(undefined, createCommandFormData(vendor.id))).rejects.toEqual(
      redirectingTo("/login"),
    );
  });

  it("blocks a viewer from creating a command", async () => {
    const viewer = await createTestUser("VIEWER");
    const vendor = await createTestVendor();
    asUser(viewer);

    await expect(createCommandAction(undefined, createCommandFormData(vendor.id))).rejects.toEqual(
      redirectingTo("/dashboard"),
    );
  });

  it("rejects a title that is too short", async () => {
    const engineer = await createTestUser("ENGINEER");
    const vendor = await createTestVendor();
    asUser(engineer);

    const result = await createCommandAction(undefined, createCommandFormData(vendor.id, { title: "AB" }));
    expect(result).toBe("Title must be at least 3 characters.");
  });

  it("rejects a missing vendor", async () => {
    const engineer = await createTestUser("ENGINEER");
    asUser(engineer);

    const result = await createCommandAction(undefined, createCommandFormData(""));
    expect(result).toBe("Select a vendor.");
  });

  it("creates a DRAFT command with LOW risk and read-only by default, and records an audit entry", async () => {
    const engineer = await createTestUser("ENGINEER");
    const vendor = await createTestVendor();
    asUser(engineer);

    await expect(createCommandAction(undefined, createCommandFormData(vendor.id))).rejects.toEqual(
      redirectingTo("/commands/"),
    );

    const command = await prisma.commandCatalogEntry.findFirstOrThrow({
      where: { title: "Check BGP Session Summary" },
    });
    expect(command.status).toBe("DRAFT");
    expect(command.riskLevel).toBe("LOW");
    expect(command.isConfigChange).toBe(false);
    expect(command.slug).toBeTruthy();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: command.id, action: "catalog.created" },
    });
    expect(audit.userId).toBe(engineer.id);
  });

  it("respects an explicit isConfigChange + riskLevel selection", async () => {
    const engineer = await createTestUser("ENGINEER");
    const vendor = await createTestVendor();
    asUser(engineer);

    const formData = createCommandFormData(vendor.id, {
      title: "Clear BGP Neighbor",
      commandText: "clear ip bgp *",
      riskLevel: "CRITICAL",
    });
    formData.set("isConfigChange", "on");

    await expect(createCommandAction(undefined, formData)).rejects.toEqual(redirectingTo("/commands/"));

    const command = await prisma.commandCatalogEntry.findFirstOrThrow({ where: { title: "Clear BGP Neighbor" } });
    expect(command.riskLevel).toBe("CRITICAL");
    expect(command.isConfigChange).toBe(true);
  });

  it("generates distinct slugs for commands sharing the same title", async () => {
    const engineer = await createTestUser("ENGINEER");
    const vendor = await createTestVendor();
    asUser(engineer);

    await createCommandAction(
      undefined,
      createCommandFormData(vendor.id, { title: "Duplicate Title Case", commandText: "show version" }),
    ).catch(() => {});
    await createCommandAction(
      undefined,
      createCommandFormData(vendor.id, { title: "Duplicate Title Case", commandText: "show inventory" }),
    ).catch(() => {});

    const commands = await prisma.commandCatalogEntry.findMany({ where: { title: "Duplicate Title Case" } });
    expect(commands).toHaveLength(2);
    expect(commands[0]?.slug).not.toBe(commands[1]?.slug);
  });

  describe("duplicate prevention", () => {
    it("rejects the same command text for the same vendor and device type", async () => {
      const engineer = await createTestUser("ENGINEER");
      const vendor = await createTestVendor();
      const deviceType = await createTestDeviceType(vendor.id);
      asUser(engineer);

      await createCommandAction(
        undefined,
        createCommandFormData(vendor.id, { title: "First Entry", deviceTypeId: deviceType.id }),
      ).catch(() => {});

      const result = await createCommandAction(
        undefined,
        createCommandFormData(vendor.id, {
          title: "Second Entry",
          commandText: "  Show   IP BGP Summary  ", // same command, different whitespace/case
          deviceTypeId: deviceType.id,
        }),
      );

      expect(result).toBe("An entry for this command already exists for this vendor and device type.");
      const commands = await prisma.commandCatalogEntry.findMany({ where: { vendorId: vendor.id } });
      expect(commands).toHaveLength(1);
    });

    it("allows the same command text for a different vendor", async () => {
      const engineer = await createTestUser("ENGINEER");
      const vendorA = await createTestVendor();
      const vendorB = await createTestVendor();
      asUser(engineer);

      await createCommandAction(undefined, createCommandFormData(vendorA.id, { title: "Vendor A Entry" })).catch(
        () => {},
      );
      await expect(
        createCommandAction(undefined, createCommandFormData(vendorB.id, { title: "Vendor B Entry" })),
      ).rejects.toEqual(redirectingTo("/commands/"));

      const commands = await prisma.commandCatalogEntry.findMany({
        where: { commandText: "show ip bgp summary" },
      });
      expect(commands).toHaveLength(2);
    });

    it("allows the same command text for the same vendor but a different device type", async () => {
      const engineer = await createTestUser("ENGINEER");
      const vendor = await createTestVendor();
      const deviceTypeA = await createTestDeviceType(vendor.id);
      const deviceTypeB = await createTestDeviceType(vendor.id);
      asUser(engineer);

      await createCommandAction(
        undefined,
        createCommandFormData(vendor.id, { title: "Device A Entry", deviceTypeId: deviceTypeA.id }),
      ).catch(() => {});
      await expect(
        createCommandAction(
          undefined,
          createCommandFormData(vendor.id, { title: "Device B Entry", deviceTypeId: deviceTypeB.id }),
        ),
      ).rejects.toEqual(redirectingTo("/commands/"));

      const commands = await prisma.commandCatalogEntry.findMany({ where: { vendorId: vendor.id } });
      expect(commands).toHaveLength(2);
    });
  });
});

describe("updateCommandAction", () => {
  it("allows an engineer to edit any command and keeps the slug stable", async () => {
    const author = await createTestUser("ENGINEER");
    const editor = await createTestUser("ENGINEER");
    const vendor = await createTestVendor();
    const command = await createTestCommand(author.id, { title: "Original Title", vendorId: vendor.id });
    const originalSlug = command.slug;

    asUser(editor);
    await expect(
      updateCommandAction(command.id, undefined, createCommandFormData(vendor.id, { title: "Updated Title" })),
    ).rejects.toEqual(redirectingTo(`/commands/${command.id}`));

    const updated = await prisma.commandCatalogEntry.findUniqueOrThrow({ where: { id: command.id } });
    expect(updated.title).toBe("Updated Title");
    expect(updated.slug).toBe(originalSlug);
    expect(updated.updatedById).toBe(editor.id);
  });

  it("blocks a viewer from editing a command", async () => {
    const author = await createTestUser("ENGINEER");
    const vendor = await createTestVendor();
    const command = await createTestCommand(author.id, { vendorId: vendor.id });
    const viewer = await createTestUser("VIEWER");

    asUser(viewer);
    await expect(
      updateCommandAction(command.id, undefined, createCommandFormData(vendor.id)),
    ).rejects.toEqual(redirectingTo("/dashboard"));
  });

  it("does not flag a command as a duplicate of itself when the command text is unchanged", async () => {
    const engineer = await createTestUser("ENGINEER");
    const vendor = await createTestVendor();
    const command = await createTestCommand(engineer.id, {
      vendorId: vendor.id,
      commandText: "show ip bgp summary",
    });

    asUser(engineer);
    await expect(
      updateCommandAction(
        command.id,
        undefined,
        createCommandFormData(vendor.id, { title: "Renamed Only" }),
      ),
    ).rejects.toEqual(redirectingTo(`/commands/${command.id}`));

    const updated = await prisma.commandCatalogEntry.findUniqueOrThrow({ where: { id: command.id } });
    expect(updated.title).toBe("Renamed Only");
  });

  it("rejects an edit that collides with a different existing command", async () => {
    const engineer = await createTestUser("ENGINEER");
    const vendor = await createTestVendor();
    await createTestCommand(engineer.id, { vendorId: vendor.id, commandText: "show version", title: "Existing" });
    const command = await createTestCommand(engineer.id, {
      vendorId: vendor.id,
      commandText: "show inventory",
      title: "To Edit",
    });

    asUser(engineer);
    const result = await updateCommandAction(
      command.id,
      undefined,
      createCommandFormData(vendor.id, { title: "To Edit", commandText: "show version" }),
    );

    expect(result).toBe("An entry for this command already exists for this vendor and device type.");
  });
});

describe("publish / archive lifecycle", () => {
  it("blocks a non-admin engineer from publishing", async () => {
    const engineer = await createTestUser("ENGINEER");
    const command = await createTestCommand(engineer.id);

    asUser(engineer);
    await expect(publishCommandAction(command.id)).rejects.toEqual(redirectingTo("/dashboard"));

    const unchanged = await prisma.commandCatalogEntry.findUniqueOrThrow({ where: { id: command.id } });
    expect(unchanged.status).toBe("DRAFT");
  });

  it("lets an admin publish a draft and records an audit entry", async () => {
    const engineer = await createTestUser("ENGINEER");
    const admin = await createTestUser("ADMIN");
    const command = await createTestCommand(engineer.id);

    asUser(admin);
    await publishCommandAction(command.id);

    const published = await prisma.commandCatalogEntry.findUniqueOrThrow({ where: { id: command.id } });
    expect(published.status).toBe("PUBLISHED");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: command.id, action: "catalog.published" },
    });
    expect(audit.userId).toBe(admin.id);
  });

  it("lets an admin archive a published command", async () => {
    const admin = await createTestUser("ADMIN");
    const command = await createTestCommand(admin.id, { status: "PUBLISHED" });

    asUser(admin);
    await archiveCommandAction(command.id);

    const archived = await prisma.commandCatalogEntry.findUniqueOrThrow({ where: { id: command.id } });
    expect(archived.status).toBe("ARCHIVED");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: command.id, action: "catalog.archived" },
    });
    expect(audit.userId).toBe(admin.id);
  });
});

describe("soft-delete command", () => {
  it("redirects to /login when there is no session", async () => {
    noSession();
    const admin = await createTestUser("ADMIN");
    const command = await createTestCommand(admin.id);

    await expect(
      softDeleteCommandAction(command.id, undefined, confirmationFormData(command.title)),
    ).rejects.toEqual(redirectingTo("/login"));
  });

  it("blocks a non-admin engineer, even with the exact title", async () => {
    const admin = await createTestUser("ADMIN");
    const engineer = await createTestUser("ENGINEER");
    const command = await createTestCommand(admin.id);

    asUser(engineer);
    await expect(
      softDeleteCommandAction(command.id, undefined, confirmationFormData(command.title)),
    ).rejects.toEqual(redirectingTo("/dashboard"));

    const stillPresent = await prisma.commandCatalogEntry.findUniqueOrThrow({ where: { id: command.id } });
    expect(stillPresent.deletedAt).toBeNull();
  });

  it("rejects an admin's confirmation text that doesn't exactly match the command title", async () => {
    const admin = await createTestUser("ADMIN");
    const command = await createTestCommand(admin.id);

    asUser(admin);
    const result = await softDeleteCommandAction(
      command.id,
      undefined,
      confirmationFormData(`${command.title}-typo`),
    );

    expect(result).toBe("Confirmation text does not match the command title.");
    const stillPresent = await prisma.commandCatalogEntry.findUniqueOrThrow({ where: { id: command.id } });
    expect(stillPresent.deletedAt).toBeNull();
  });

  it("soft-deletes the command when an admin confirms with the exact title", async () => {
    const admin = await createTestUser("ADMIN");
    const command = await createTestCommand(admin.id);

    asUser(admin);
    await expect(
      softDeleteCommandAction(command.id, undefined, confirmationFormData(command.title)),
    ).rejects.toEqual(redirectingTo("/commands"));

    const deleted = await prisma.commandCatalogEntry.findUniqueOrThrow({ where: { id: command.id } });
    expect(deleted.deletedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: command.id, action: "catalog.soft_deleted" },
    });
    expect(audit.userId).toBe(admin.id);
  });

  it("a soft-deleted command no longer blocks a genuinely new duplicate", async () => {
    const admin = await createTestUser("ADMIN");
    const vendor = await createTestVendor();
    const original = await createTestCommand(admin.id, { vendorId: vendor.id, commandText: "show version" });

    asUser(admin);
    await softDeleteCommandAction(original.id, undefined, confirmationFormData(original.title)).catch(() => {});

    await expect(
      createCommandAction(
        undefined,
        createCommandFormData(vendor.id, { title: "Recreated Entry", commandText: "show version" }),
      ),
    ).rejects.toEqual(redirectingTo("/commands/"));

    const active = await prisma.commandCatalogEntry.findMany({
      where: { vendorId: vendor.id, commandText: "show version", deletedAt: null },
    });
    expect(active).toHaveLength(1);
  });
});

describe("listCommands search and filtering", () => {
  it("excludes soft-deleted and out-of-scope statuses", async () => {
    const admin = await createTestUser("ADMIN");
    const published = await createTestCommand(admin.id, { status: "PUBLISHED", title: "Published Only Command" });
    await createTestCommand(admin.id, { status: "DRAFT", title: "Draft Only Command" });
    const deleted = await createTestCommand(admin.id, { status: "PUBLISHED", title: "Deleted Published Command" });
    await prisma.commandCatalogEntry.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const results = await listCommands({ statuses: ["PUBLISHED"] });

    expect(results.map((command) => command.id)).toContain(published.id);
    expect(results.map((command) => command.id)).not.toContain(deleted.id);
    expect(results.every((command) => command.status === "PUBLISHED")).toBe(true);
  });

  it("matches a search query case-insensitively across title, command text, description, and purpose", async () => {
    const admin = await createTestUser("ADMIN");
    const match = await createTestCommand(admin.id, {
      status: "PUBLISHED",
      title: "OSPF Neighbor Check",
      commandText: "show ip ospf neighbor",
      description: "Unrelated description text.",
    });
    await createTestCommand(admin.id, { status: "PUBLISHED", title: "Completely Different Topic" });

    const results = await listCommands({ statuses: ["PUBLISHED"], query: "ospf neighbor" });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(match.id);
  });

  it("filters by vendor", async () => {
    const admin = await createTestUser("ADMIN");
    const vendor = await createTestVendor();
    const matching = await createTestCommand(admin.id, { status: "PUBLISHED", vendorId: vendor.id });
    await createTestCommand(admin.id, { status: "PUBLISHED" });

    const results = await listCommands({ statuses: ["PUBLISHED"], vendorId: vendor.id });

    expect(results.map((command) => command.id)).toEqual([matching.id]);
  });

  it("filters by risk level", async () => {
    const admin = await createTestUser("ADMIN");
    const critical = await createTestCommand(admin.id, { status: "PUBLISHED", riskLevel: "CRITICAL" });
    await createTestCommand(admin.id, { status: "PUBLISHED", riskLevel: "LOW" });

    const results = await listCommands({ statuses: ["PUBLISHED"], riskLevel: "CRITICAL" });

    expect(results.map((command) => command.id)).toEqual([critical.id]);
  });

  it("filters by config-change vs read-only", async () => {
    const admin = await createTestUser("ADMIN");
    const configChange = await createTestCommand(admin.id, { status: "PUBLISHED", isConfigChange: true });
    await createTestCommand(admin.id, { status: "PUBLISHED", isConfigChange: false });

    const results = await listCommands({ statuses: ["PUBLISHED"], isConfigChange: true });

    expect(results.map((command) => command.id)).toEqual([configChange.id]);
  });
});
