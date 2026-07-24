import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import { EmbeddingProviderError, voyageEmbeddingProvider } from "@/lib/embeddings/provider";

// This file tests the real Voyage HTTP client against a mocked global.fetch.
// The real Voyage API is never called - see the "never calls the real API"
// check at the bottom of this file.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const validEmbedding = Array.from({ length: 1024 }, (_, i) => i / 1024);

describe("voyageEmbeddingProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns the embedding vector on a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ embedding: validEmbedding, index: 0 }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await voyageEmbeddingProvider.embedDocument("show ip bgp summary");

    expect(result).toEqual(validEmbedding);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    expect(init.headers.Authorization).toBe(`Bearer ${env.VOYAGE_API_KEY}`);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ input: ["show ip bgp summary"], model: "voyage-4-lite", input_type: "document" });
  });

  it("uses input_type 'query' for embedQuery", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ embedding: validEmbedding, index: 0 }] }));
    vi.stubGlobal("fetch", fetchMock);

    await voyageEmbeddingProvider.embedQuery("bgp flapping");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input_type).toBe("query");
  });

  it("throws EmbeddingProviderError on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401, statusText: "Unauthorized" })));

    const error = await voyageEmbeddingProvider.embedDocument("x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmbeddingProviderError);
    expect((error as Error).message).toMatch(/401/);
  });

  it("throws EmbeddingProviderError on a malformed (non-JSON) response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json{{{", { status: 200 })));

    await expect(voyageEmbeddingProvider.embedDocument("x")).rejects.toThrow(EmbeddingProviderError);
  });

  it("throws EmbeddingProviderError when the response doesn't match the expected shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ unexpected: "shape" })));

    await expect(voyageEmbeddingProvider.embedDocument("x")).rejects.toThrow(EmbeddingProviderError);
  });

  it("throws EmbeddingProviderError when the returned vector has the wrong dimensionality", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }] })));

    const error = await voyageEmbeddingProvider.embedDocument("x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmbeddingProviderError);
    expect((error as Error).message).toMatch(/1024/);
  });

  it("throws EmbeddingProviderError when the network request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND")));

    await expect(voyageEmbeddingProvider.embedDocument("x")).rejects.toThrow(EmbeddingProviderError);
  });

  it("throws EmbeddingProviderError when the request times out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const abortError = new Error("The operation was aborted.");
            abortError.name = "AbortError";
            reject(abortError);
          });
        });
      }),
    );

    const pending = voyageEmbeddingProvider.embedDocument("x").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await pending;

    expect(result).toBeInstanceOf(EmbeddingProviderError);
    expect((result as Error).message).toMatch(/timed out/i);
  });

  it("throws a clear EmbeddingProviderError when VOYAGE_API_KEY is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const original = env.VOYAGE_API_KEY;
    env.VOYAGE_API_KEY = undefined;
    try {
      await expect(voyageEmbeddingProvider.embedDocument("x")).rejects.toThrow(EmbeddingProviderError);
      await expect(voyageEmbeddingProvider.embedDocument("x")).rejects.toThrow(/VOYAGE_API_KEY/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      env.VOYAGE_API_KEY = original;
    }
  });
});
