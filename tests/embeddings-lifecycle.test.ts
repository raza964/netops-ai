import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { mockSessionState } from "./setup";
import { createTestArticle, createTestCommand, createTestUser, createTestVendor } from "./helpers/db";

// The Voyage provider is fully mocked for this whole file - these tests
// verify that the KB/Command lifecycle actions correctly trigger indexing
// and cleanup, and that a Voyage failure never blocks the underlying
// publish/update action. The real Voyage API is never reached.
vi.mock("@/lib/embeddings/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/embeddings/provider")>();
  return {
    ...actual,
    voyageEmbeddingProvider: {
      model: "voyage-4-lite",
      dimensions: 3,
      embedDocument: vi.fn(async () => [0.1, 0.2, 0.3]),
      embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
    },
  };
});

import { voyageEmbeddingProvider } from "@/lib/embeddings/provider";
import {
  archiveArticleAction,
  publishArticleAction,
  softDeleteArticleAction,
  updateArticleAction,
} from "@/app/(dashboard)/kb/[articleId]/actions";
import {
  archiveCommandAction,
  publishCommandAction,
  softDeleteCommandAction,
  updateCommandAction,
} from "@/app/(dashboard)/commands/[commandId]/actions";

function asUser(user: { id: string; role: string }) {
  mockSessionState.current = { user: { id: user.id, role: user.role } };
}

function redirectingTo(path: string) {
  return expect.objectContaining({ digest: expect.stringContaining(`NEXT_REDIRECT;replace;${path}`) });
}

function articleFormData(overrides: Partial<Record<"title" | "summary" | "content", string>> = {}) {
  const data = new FormData();
  data.set("title", overrides.title ?? "Reindex Test Article");
  data.set("summary", overrides.summary ?? "Summary text long enough to pass validation.");
  data.set("content", overrides.content ?? "Content body long enough to pass validation checks.");
  return data;
}

function commandFormData(
  vendorId: string,
  overrides: Partial<Record<"title" | "commandText" | "description", string>> = {},
) {
  const data = new FormData();
  data.set("title", overrides.title ?? "Reindex Test Command");
  data.set("commandText", overrides.commandText ?? "show version");
  data.set("description", overrides.description ?? "Description text long enough to pass validation.");
  data.set("vendorId", vendorId);
  data.set("riskLevel", "LOW");
  return data;
}

describe("KB article actions drive the embedding lifecycle", () => {
  it("indexes the article when it is published", async () => {
    const admin = await createTestUser("ADMIN");
    const article = await createTestArticle(admin.id, { status: "DRAFT" });
    asUser(admin);

    await publishArticleAction(article.id);

    expect(voyageEmbeddingProvider.embedDocument).toHaveBeenCalledTimes(1);
    expect(await prisma.contentEmbedding.findUnique({ where: { kbArticleId: article.id } })).not.toBeNull();
  });

  it("reindexes on update while the article is published", async () => {
    const admin = await createTestUser("ADMIN");
    const article = await createTestArticle(admin.id, { status: "PUBLISHED" });
    asUser(admin);

    await expect(
      updateArticleAction(article.id, undefined, articleFormData({ title: "Changed Title" })),
    ).rejects.toEqual(redirectingTo(`/kb/${article.id}`));

    expect(voyageEmbeddingProvider.embedDocument).toHaveBeenCalledTimes(1);
  });

  it("does not reindex when an update resubmits identical content", async () => {
    const admin = await createTestUser("ADMIN");
    const article = await createTestArticle(admin.id, {
      status: "PUBLISHED",
      title: "Stable Title",
      summary: "Stable summary text here.",
      content: "Stable content body here.",
    });
    asUser(admin);
    await publishArticleAction(article.id);
    expect(voyageEmbeddingProvider.embedDocument).toHaveBeenCalledTimes(1);

    await expect(
      updateArticleAction(
        article.id,
        undefined,
        articleFormData({
          title: "Stable Title",
          summary: "Stable summary text here.",
          content: "Stable content body here.",
        }),
      ),
    ).rejects.toEqual(redirectingTo(`/kb/${article.id}`));

    expect(voyageEmbeddingProvider.embedDocument).toHaveBeenCalledTimes(1);
  });

  it("does not index on update while the article is still DRAFT", async () => {
    const engineer = await createTestUser("ENGINEER");
    const article = await createTestArticle(engineer.id, { status: "DRAFT" });
    asUser(engineer);

    await expect(updateArticleAction(article.id, undefined, articleFormData())).rejects.toEqual(
      redirectingTo(`/kb/${article.id}`),
    );

    expect(voyageEmbeddingProvider.embedDocument).not.toHaveBeenCalled();
  });

  it("removes the embedding when the article is archived", async () => {
    const admin = await createTestUser("ADMIN");
    const article = await createTestArticle(admin.id, { status: "DRAFT" });
    asUser(admin);
    await publishArticleAction(article.id);

    await archiveArticleAction(article.id);

    expect(await prisma.contentEmbedding.findUnique({ where: { kbArticleId: article.id } })).toBeNull();
  });

  it("removes the embedding when the article is soft-deleted", async () => {
    const admin = await createTestUser("ADMIN");
    const article = await createTestArticle(admin.id, { status: "DRAFT" });
    asUser(admin);
    await publishArticleAction(article.id);

    const confirmation = new FormData();
    confirmation.set("confirmation", article.title);
    await expect(softDeleteArticleAction(article.id, undefined, confirmation)).rejects.toEqual(redirectingTo("/kb"));

    expect(await prisma.contentEmbedding.findUnique({ where: { kbArticleId: article.id } })).toBeNull();
  });

  it("does not let a Voyage failure block publishing", async () => {
    const admin = await createTestUser("ADMIN");
    const article = await createTestArticle(admin.id, { status: "DRAFT" });
    asUser(admin);
    vi.mocked(voyageEmbeddingProvider.embedDocument).mockRejectedValueOnce(new Error("Voyage is down"));

    await expect(publishArticleAction(article.id)).resolves.toBeUndefined();

    const published = await prisma.knowledgeBaseArticle.findUniqueOrThrow({ where: { id: article.id } });
    expect(published.status).toBe("PUBLISHED");
  });
});

describe("Command Catalog actions drive the embedding lifecycle", () => {
  it("indexes the command when it is published", async () => {
    const admin = await createTestUser("ADMIN");
    const vendor = await createTestVendor();
    const command = await createTestCommand(admin.id, { vendorId: vendor.id, status: "DRAFT" });
    asUser(admin);

    await publishCommandAction(command.id);

    expect(voyageEmbeddingProvider.embedDocument).toHaveBeenCalledTimes(1);
    expect(await prisma.contentEmbedding.findUnique({ where: { commandId: command.id } })).not.toBeNull();
  });

  it("reindexes on update while the command is published", async () => {
    const admin = await createTestUser("ADMIN");
    const vendor = await createTestVendor();
    const command = await createTestCommand(admin.id, { vendorId: vendor.id, status: "PUBLISHED" });
    asUser(admin);

    await expect(
      updateCommandAction(command.id, undefined, commandFormData(vendor.id, { title: "Changed Command" })),
    ).rejects.toEqual(redirectingTo(`/commands/${command.id}`));

    expect(voyageEmbeddingProvider.embedDocument).toHaveBeenCalledTimes(1);
  });

  it("does not reindex when an update resubmits identical content", async () => {
    const admin = await createTestUser("ADMIN");
    const vendor = await createTestVendor();
    const command = await createTestCommand(admin.id, {
      vendorId: vendor.id,
      status: "PUBLISHED",
      title: "Stable Command",
      commandText: "show version",
      description: "Stable description text here.",
    });
    asUser(admin);
    await publishCommandAction(command.id);
    expect(voyageEmbeddingProvider.embedDocument).toHaveBeenCalledTimes(1);

    await expect(
      updateCommandAction(
        command.id,
        undefined,
        commandFormData(vendor.id, {
          title: "Stable Command",
          commandText: "show version",
          description: "Stable description text here.",
        }),
      ),
    ).rejects.toEqual(redirectingTo(`/commands/${command.id}`));

    expect(voyageEmbeddingProvider.embedDocument).toHaveBeenCalledTimes(1);
  });

  it("removes the embedding when the command is archived", async () => {
    const admin = await createTestUser("ADMIN");
    const vendor = await createTestVendor();
    const command = await createTestCommand(admin.id, { vendorId: vendor.id, status: "DRAFT" });
    asUser(admin);
    await publishCommandAction(command.id);

    await archiveCommandAction(command.id);

    expect(await prisma.contentEmbedding.findUnique({ where: { commandId: command.id } })).toBeNull();
  });

  it("removes the embedding when the command is soft-deleted", async () => {
    const admin = await createTestUser("ADMIN");
    const vendor = await createTestVendor();
    const command = await createTestCommand(admin.id, { vendorId: vendor.id, status: "DRAFT" });
    asUser(admin);
    await publishCommandAction(command.id);

    const confirmation = new FormData();
    confirmation.set("confirmation", command.title);
    await expect(softDeleteCommandAction(command.id, undefined, confirmation)).rejects.toEqual(
      redirectingTo("/commands"),
    );

    expect(await prisma.contentEmbedding.findUnique({ where: { commandId: command.id } })).toBeNull();
  });

  it("does not let a Voyage failure block publishing", async () => {
    const admin = await createTestUser("ADMIN");
    const vendor = await createTestVendor();
    const command = await createTestCommand(admin.id, { vendorId: vendor.id, status: "DRAFT" });
    asUser(admin);
    vi.mocked(voyageEmbeddingProvider.embedDocument).mockRejectedValueOnce(new Error("Voyage is down"));

    await expect(publishCommandAction(command.id)).resolves.toBeUndefined();

    const published = await prisma.commandCatalogEntry.findUniqueOrThrow({ where: { id: command.id } });
    expect(published.status).toBe("PUBLISHED");
  });
});
