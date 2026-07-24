import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { cosineSimilarity } from "@/lib/embeddings/similarity";
import { indexCommand, indexKbArticle } from "@/lib/embeddings/indexer";
import { semanticSearch } from "@/lib/embeddings/search";
import { EmbeddingProviderError, type EmbeddingProvider } from "@/lib/embeddings/provider";
import { createTestArticle, createTestCommand, createTestUser, createTestVendor } from "./helpers/db";

/** A DI-injected fake provider - no network, no mocking of the fetch layer. */
function createFakeProvider(vector: number[]) {
  return {
    model: "fake-embedding-model",
    dimensions: vector.length,
    embedDocument: vi.fn(async () => vector),
    embedQuery: vi.fn(async () => vector),
  };
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 instead of NaN for a zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("throws when dimensions differ", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});

describe("indexKbArticle", () => {
  it("does not index a DRAFT article and makes no provider call", async () => {
    const user = await createTestUser("ENGINEER");
    const article = await createTestArticle(user.id, { status: "DRAFT" });
    const provider = createFakeProvider([1, 0, 0]);

    const result = await indexKbArticle(article.id, provider);

    expect(result).toEqual({ indexed: false, reason: "not-eligible" });
    expect(provider.embedDocument).not.toHaveBeenCalled();
    expect(await prisma.contentEmbedding.findUnique({ where: { kbArticleId: article.id } })).toBeNull();
  });

  it("indexes a PUBLISHED article", async () => {
    const user = await createTestUser("ENGINEER");
    const article = await createTestArticle(user.id, {
      status: "PUBLISHED",
      title: "BGP Session Flapping",
      summary: "Root cause of BGP flaps.",
      content: "MTU mismatch causes repeated BGP resets.",
    });
    const provider = createFakeProvider([1, 0, 0]);

    const result = await indexKbArticle(article.id, provider);

    expect(result).toEqual({ indexed: true });
    expect(provider.embedDocument).toHaveBeenCalledTimes(1);
    expect(provider.embedDocument.mock.calls[0][0]).toContain("BGP Session Flapping");

    const stored = await prisma.contentEmbedding.findUniqueOrThrow({ where: { kbArticleId: article.id } });
    expect(stored.embedding).toEqual([1, 0, 0]);
    expect(stored.sourceType).toBe("KB_ARTICLE");
    expect(stored.model).toBe(provider.model);
    expect(stored.dimensions).toBe(provider.dimensions);
  });

  it("skips re-embedding and makes no provider call when content is unchanged", async () => {
    const user = await createTestUser("ENGINEER");
    const article = await createTestArticle(user.id, { status: "PUBLISHED" });
    const provider = createFakeProvider([1, 0, 0]);

    await indexKbArticle(article.id, provider);
    const result = await indexKbArticle(article.id, provider);

    expect(result).toEqual({ indexed: false, reason: "unchanged" });
    expect(provider.embedDocument).toHaveBeenCalledTimes(1);
  });

  it("re-embeds after the article's content changes", async () => {
    const user = await createTestUser("ENGINEER");
    const article = await createTestArticle(user.id, { status: "PUBLISHED", summary: "Original summary." });
    const provider = createFakeProvider([1, 0, 0]);
    await indexKbArticle(article.id, provider);

    await prisma.knowledgeBaseArticle.update({ where: { id: article.id }, data: { summary: "Updated summary." } });
    const result = await indexKbArticle(article.id, provider);

    expect(result).toEqual({ indexed: true });
    expect(provider.embedDocument).toHaveBeenCalledTimes(2);
  });

  it("removes the embedding once the article is archived", async () => {
    const user = await createTestUser("ENGINEER");
    const article = await createTestArticle(user.id, { status: "PUBLISHED" });
    const provider = createFakeProvider([1, 0, 0]);
    await indexKbArticle(article.id, provider);

    await prisma.knowledgeBaseArticle.update({ where: { id: article.id }, data: { status: "ARCHIVED" } });
    const result = await indexKbArticle(article.id, provider);

    expect(result).toEqual({ indexed: false, reason: "not-eligible" });
    expect(await prisma.contentEmbedding.findUnique({ where: { kbArticleId: article.id } })).toBeNull();
  });

  it("propagates a provider failure rather than swallowing it", async () => {
    const user = await createTestUser("ENGINEER");
    const article = await createTestArticle(user.id, { status: "PUBLISHED" });
    const failingProvider: EmbeddingProvider = {
      model: "fake",
      dimensions: 3,
      embedDocument: vi.fn().mockRejectedValue(new EmbeddingProviderError("Voyage is down")),
      embedQuery: vi.fn(),
    };

    await expect(indexKbArticle(article.id, failingProvider)).rejects.toThrow(EmbeddingProviderError);
  });
});

describe("indexCommand", () => {
  it("does not index a DRAFT command and makes no provider call", async () => {
    const user = await createTestUser("ENGINEER");
    const command = await createTestCommand(user.id, { status: "DRAFT" });
    const provider = createFakeProvider([1, 0, 0]);

    const result = await indexCommand(command.id, provider);

    expect(result).toEqual({ indexed: false, reason: "not-eligible" });
    expect(provider.embedDocument).not.toHaveBeenCalled();
  });

  it("indexes a PUBLISHED command", async () => {
    const user = await createTestUser("ENGINEER");
    const command = await createTestCommand(user.id, {
      status: "PUBLISHED",
      title: "Check BGP Summary",
      commandText: "show ip bgp summary",
    });
    const provider = createFakeProvider([0, 1, 0]);

    const result = await indexCommand(command.id, provider);

    expect(result).toEqual({ indexed: true });
    const stored = await prisma.contentEmbedding.findUniqueOrThrow({ where: { commandId: command.id } });
    expect(stored.sourceType).toBe("COMMAND_CATALOG_ENTRY");
    expect(stored.embedding).toEqual([0, 1, 0]);
  });

  it("skips re-embedding when content is unchanged", async () => {
    const user = await createTestUser("ENGINEER");
    const command = await createTestCommand(user.id, { status: "PUBLISHED" });
    const provider = createFakeProvider([0, 1, 0]);

    await indexCommand(command.id, provider);
    const result = await indexCommand(command.id, provider);

    expect(result).toEqual({ indexed: false, reason: "unchanged" });
    expect(provider.embedDocument).toHaveBeenCalledTimes(1);
  });

  it("removes the embedding once the command is soft-deleted", async () => {
    const user = await createTestUser("ENGINEER");
    const command = await createTestCommand(user.id, { status: "PUBLISHED" });
    const provider = createFakeProvider([0, 1, 0]);
    await indexCommand(command.id, provider);

    await prisma.commandCatalogEntry.update({ where: { id: command.id }, data: { deletedAt: new Date() } });
    const result = await indexCommand(command.id, provider);

    expect(result).toEqual({ indexed: false, reason: "not-eligible" });
    expect(await prisma.contentEmbedding.findUnique({ where: { commandId: command.id } })).toBeNull();
  });
});

describe("semanticSearch", () => {
  it("ranks results by cosine similarity, closest match first", async () => {
    const user = await createTestUser("ADMIN");
    const bgpArticle = await createTestArticle(user.id, { status: "PUBLISHED", title: "BGP Session Flapping" });
    const ospfArticle = await createTestArticle(user.id, { status: "PUBLISHED", title: "OSPF Adjacency Stuck" });
    const vendor = await createTestVendor();
    const vlanCommand = await createTestCommand(user.id, { vendorId: vendor.id, status: "PUBLISHED", title: "Show VLANs" });

    await indexKbArticle(bgpArticle.id, createFakeProvider([1, 0, 0]));
    await indexKbArticle(ospfArticle.id, createFakeProvider([0, 1, 0]));
    await indexCommand(vlanCommand.id, createFakeProvider([0, 0, 1]));

    const results = await semanticSearch("bgp issue", { provider: createFakeProvider([0.9, 0.1, 0]) });

    expect(results.map((r) => r.id)).toEqual([bgpArticle.id, ospfArticle.id, vlanCommand.id]);
    expect(results[0].sourceType).toBe("KB_ARTICLE");
    expect(results[2].sourceType).toBe("COMMAND_CATALOG_ENTRY");
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
  });

  it("respects the top-K limit", async () => {
    const user = await createTestUser("ADMIN");
    for (let i = 0; i < 5; i += 1) {
      const article = await createTestArticle(user.id, { status: "PUBLISHED", title: `Article ${i}` });
      await indexKbArticle(article.id, createFakeProvider([i, 1, 0]));
    }

    const results = await semanticSearch("query", { limit: 2, provider: createFakeProvider([1, 0, 0]) });

    expect(results).toHaveLength(2);
  });

  it("excludes a DRAFT article's embedding even if one exists (defense in depth)", async () => {
    const user = await createTestUser("ADMIN");
    const draft = await createTestArticle(user.id, { status: "DRAFT", title: "Draft Article" });
    // Written directly, bypassing indexKbArticle's own eligibility check, to
    // prove semanticSearch/listSearchableEmbeddings filter independently.
    await prisma.contentEmbedding.create({
      data: {
        sourceType: "KB_ARTICLE",
        kbArticleId: draft.id,
        content: "draft content",
        contentHash: "irrelevant-hash",
        embedding: [1, 0, 0],
        model: "fake",
        dimensions: 3,
      },
    });

    const results = await semanticSearch("query", { provider: createFakeProvider([1, 0, 0]) });

    expect(results.map((r) => r.id)).not.toContain(draft.id);
  });

  it("excludes a soft-deleted article's embedding even if one is stale in the table", async () => {
    const user = await createTestUser("ADMIN");
    const article = await createTestArticle(user.id, { status: "PUBLISHED" });
    await indexKbArticle(article.id, createFakeProvider([1, 0, 0]));

    await prisma.knowledgeBaseArticle.update({ where: { id: article.id }, data: { deletedAt: new Date() } });

    const results = await semanticSearch("query", { provider: createFakeProvider([1, 0, 0]) });

    expect(results.map((r) => r.id)).not.toContain(article.id);
  });

  it("excludes an archived command's embedding even if one is stale in the table", async () => {
    const user = await createTestUser("ADMIN");
    const vendor = await createTestVendor();
    const command = await createTestCommand(user.id, { vendorId: vendor.id, status: "PUBLISHED" });
    await indexCommand(command.id, createFakeProvider([1, 0, 0]));

    await prisma.commandCatalogEntry.update({ where: { id: command.id }, data: { status: "ARCHIVED" } });

    const results = await semanticSearch("query", { provider: createFakeProvider([1, 0, 0]) });

    expect(results.map((r) => r.id)).not.toContain(command.id);
  });

  it(
    "is not role-gated by itself - the same published-only result set is returned for every " +
      "caller, which is what the search page relies on for RBAC (see app/(dashboard)/search/page.tsx)",
    async () => {
      const user = await createTestUser("ADMIN");
      const published = await createTestArticle(user.id, { status: "PUBLISHED", title: "Published Article" });
      await indexKbArticle(published.id, createFakeProvider([1, 0, 0]));

      const results = await semanticSearch("query", { provider: createFakeProvider([1, 0, 0]) });

      expect(results.map((r) => r.id)).toEqual([published.id]);
    },
  );
});

describe("test database isolation", () => {
  it("runs against an isolated _test database, never the development database", () => {
    expect(env.DATABASE_URL).toContain("_test");
  });
});
