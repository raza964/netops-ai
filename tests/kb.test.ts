import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createArticleAction } from "@/app/(dashboard)/kb/actions";
import {
  archiveArticleAction,
  publishArticleAction,
  softDeleteArticleAction,
  updateArticleAction,
} from "@/app/(dashboard)/kb/[articleId]/actions";
import { listArticles } from "@/lib/data/kb";
import { mockSessionState } from "./setup";
import { createTestArticle, createTestUser } from "./helpers/db";

function asUser(user: { id: string; role: string }) {
  mockSessionState.current = { user: { id: user.id, role: user.role } };
}

function redirectingTo(path: string) {
  return expect.objectContaining({ digest: expect.stringContaining(`NEXT_REDIRECT;replace;${path}`) });
}

function createArticleFormData(overrides: Partial<Record<"title" | "summary" | "content", string>> = {}) {
  const data = new FormData();
  data.set("title", overrides.title ?? "BGP Session Flapping on Edge Routers");
  data.set("summary", overrides.summary ?? "Root cause and fix for BGP flaps caused by MTU mismatches.");
  data.set("content", overrides.content ?? "Detailed walkthrough of diagnosing and resolving the MTU mismatch.");
  return data;
}

function confirmationFormData(confirmation: string) {
  const data = new FormData();
  data.set("confirmation", confirmation);
  return data;
}

describe("createArticleAction", () => {
  it("blocks a viewer from creating an article", async () => {
    const viewer = await createTestUser("VIEWER");
    asUser(viewer);

    await expect(createArticleAction(undefined, createArticleFormData())).rejects.toEqual(
      redirectingTo("/dashboard"),
    );
  });

  it("rejects a title that is too short", async () => {
    const engineer = await createTestUser("ENGINEER");
    asUser(engineer);

    const result = await createArticleAction(undefined, createArticleFormData({ title: "AB" }));
    expect(result).toBe("Title must be at least 3 characters.");
  });

  it("creates a DRAFT article, records an audit entry, and redirects to it", async () => {
    const engineer = await createTestUser("ENGINEER");
    asUser(engineer);

    await expect(createArticleAction(undefined, createArticleFormData())).rejects.toEqual(
      redirectingTo("/kb/"),
    );

    const article = await prisma.knowledgeBaseArticle.findFirstOrThrow({
      where: { title: "BGP Session Flapping on Edge Routers" },
    });
    expect(article.status).toBe("DRAFT");
    expect(article.slug).toBeTruthy();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: article.id, action: "kb.created" },
    });
    expect(audit.userId).toBe(engineer.id);
  });

  it("generates distinct slugs for articles sharing the same title", async () => {
    const engineer = await createTestUser("ENGINEER");
    asUser(engineer);

    await createArticleAction(undefined, createArticleFormData({ title: "Duplicate Title Case" })).catch(() => {});
    await createArticleAction(undefined, createArticleFormData({ title: "Duplicate Title Case" })).catch(() => {});

    const articles = await prisma.knowledgeBaseArticle.findMany({ where: { title: "Duplicate Title Case" } });
    expect(articles).toHaveLength(2);
    expect(articles[0]?.slug).not.toBe(articles[1]?.slug);
  });
});

describe("updateArticleAction", () => {
  it("allows an engineer to edit any article and keeps the slug stable", async () => {
    const author = await createTestUser("ENGINEER");
    const editor = await createTestUser("ENGINEER");
    const article = await createTestArticle(author.id, { title: "Original Title" });
    const originalSlug = article.slug;

    asUser(editor);
    await expect(
      updateArticleAction(
        article.id,
        undefined,
        createArticleFormData({ title: "Updated Title", summary: "Updated summary text here.", content: "Updated body content here." }),
      ),
    ).rejects.toEqual(redirectingTo(`/kb/${article.id}`));

    const updated = await prisma.knowledgeBaseArticle.findUniqueOrThrow({ where: { id: article.id } });
    expect(updated.title).toBe("Updated Title");
    expect(updated.slug).toBe(originalSlug);
    expect(updated.updatedById).toBe(editor.id);
  });

  it("blocks a viewer from editing an article", async () => {
    const author = await createTestUser("ENGINEER");
    const article = await createTestArticle(author.id);
    const viewer = await createTestUser("VIEWER");

    asUser(viewer);
    await expect(updateArticleAction(article.id, undefined, createArticleFormData())).rejects.toEqual(
      redirectingTo("/dashboard"),
    );
  });
});

describe("publish / archive lifecycle", () => {
  it("blocks a non-admin engineer from publishing", async () => {
    const engineer = await createTestUser("ENGINEER");
    const article = await createTestArticle(engineer.id);

    asUser(engineer);
    await expect(publishArticleAction(article.id)).rejects.toEqual(redirectingTo("/dashboard"));

    const unchanged = await prisma.knowledgeBaseArticle.findUniqueOrThrow({ where: { id: article.id } });
    expect(unchanged.status).toBe("DRAFT");
  });

  it("lets an admin publish a draft and records an audit entry", async () => {
    const engineer = await createTestUser("ENGINEER");
    const admin = await createTestUser("ADMIN");
    const article = await createTestArticle(engineer.id);

    asUser(admin);
    await publishArticleAction(article.id);

    const published = await prisma.knowledgeBaseArticle.findUniqueOrThrow({ where: { id: article.id } });
    expect(published.status).toBe("PUBLISHED");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: article.id, action: "kb.published" },
    });
    expect(audit.userId).toBe(admin.id);
  });

  it("lets an admin archive a published article", async () => {
    const admin = await createTestUser("ADMIN");
    const article = await createTestArticle(admin.id, { status: "PUBLISHED" });

    asUser(admin);
    await archiveArticleAction(article.id);

    const archived = await prisma.knowledgeBaseArticle.findUniqueOrThrow({ where: { id: article.id } });
    expect(archived.status).toBe("ARCHIVED");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: article.id, action: "kb.archived" },
    });
    expect(audit.userId).toBe(admin.id);
  });
});

describe("soft-delete article", () => {
  it("blocks a non-admin engineer, even with the exact title", async () => {
    const admin = await createTestUser("ADMIN");
    const engineer = await createTestUser("ENGINEER");
    const article = await createTestArticle(admin.id);

    asUser(engineer);
    await expect(
      softDeleteArticleAction(article.id, undefined, confirmationFormData(article.title)),
    ).rejects.toEqual(redirectingTo("/dashboard"));

    const stillPresent = await prisma.knowledgeBaseArticle.findUniqueOrThrow({ where: { id: article.id } });
    expect(stillPresent.deletedAt).toBeNull();
  });

  it("rejects an admin's confirmation text that doesn't exactly match the article title", async () => {
    const admin = await createTestUser("ADMIN");
    const article = await createTestArticle(admin.id);

    asUser(admin);
    const result = await softDeleteArticleAction(
      article.id,
      undefined,
      confirmationFormData(`${article.title}-typo`),
    );

    expect(result).toBe("Confirmation text does not match the article title.");
    const stillPresent = await prisma.knowledgeBaseArticle.findUniqueOrThrow({ where: { id: article.id } });
    expect(stillPresent.deletedAt).toBeNull();
  });

  it("soft-deletes the article when an admin confirms with the exact title", async () => {
    const admin = await createTestUser("ADMIN");
    const article = await createTestArticle(admin.id);

    asUser(admin);
    await expect(
      softDeleteArticleAction(article.id, undefined, confirmationFormData(article.title)),
    ).rejects.toEqual(redirectingTo("/kb"));

    const deleted = await prisma.knowledgeBaseArticle.findUniqueOrThrow({ where: { id: article.id } });
    expect(deleted.deletedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: article.id, action: "kb.soft_deleted" },
    });
    expect(audit.userId).toBe(admin.id);
  });
});

describe("listArticles search and filtering", () => {
  it("excludes soft-deleted and out-of-scope statuses", async () => {
    const admin = await createTestUser("ADMIN");
    const published = await createTestArticle(admin.id, { status: "PUBLISHED", title: "Published Only Article" });
    await createTestArticle(admin.id, { status: "DRAFT", title: "Draft Only Article" });
    const deleted = await createTestArticle(admin.id, { status: "PUBLISHED", title: "Deleted Published Article" });
    await prisma.knowledgeBaseArticle.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const results = await listArticles({ statuses: ["PUBLISHED"] });

    expect(results.items.map((article) => article.id)).toContain(published.id);
    expect(results.items.map((article) => article.id)).not.toContain(deleted.id);
    expect(results.items.every((article) => article.status === "PUBLISHED")).toBe(true);
  });

  it("matches a search query case-insensitively across title, summary, and content", async () => {
    const admin = await createTestUser("ADMIN");
    const match = await createTestArticle(admin.id, {
      status: "PUBLISHED",
      title: "OSPF Adjacency Stuck in Init",
      summary: "Unrelated summary text.",
      content: "Unrelated content text.",
    });
    await createTestArticle(admin.id, { status: "PUBLISHED", title: "Completely Different Topic" });

    const results = await listArticles({ statuses: ["PUBLISHED"], query: "ospf adjacency" });

    expect(results).toHaveLength(1);
    expect(results.items[0]?.id).toBe(match.id);
  });

  it("filters by vendor", async () => {
    const admin = await createTestUser("ADMIN");
    const vendor = await prisma.vendor.create({ data: { name: "Filter Vendor Co", slug: "filter-vendor-co" } });
    const matching = await createTestArticle(admin.id, { status: "PUBLISHED", vendorId: vendor.id });
    await createTestArticle(admin.id, { status: "PUBLISHED" });

    const results = await listArticles({ statuses: ["PUBLISHED"], vendorId: vendor.id });

    expect(results.items.map((article) => article.id)).toEqual([matching.id]);
  });
});
