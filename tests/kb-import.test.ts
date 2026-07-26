import { describe, expect, it } from "vitest";
import { kbImportBatchSchema } from "@/lib/validation/kb-import";

const validFile = {
  name: "BGP troubleshooting.md",
  relativePath: "routing/BGP troubleshooting.md",
  content: "# BGP troubleshooting\n\nA sufficiently detailed article body for validation.",
  sha256: "a".repeat(64),
  category: "routing",
  sensitivity: "STANDARD" as const,
};

describe("knowledge source import validation", () => {
  it("accepts a valid draft import batch", () => {
    const result = kbImportBatchSchema.safeParse({ collection: "LECTURE", files: [validFile] });
    expect(result.success).toBe(true);
  });

  it("rejects invalid hashes and unknown collections", () => {
    const result = kbImportBatchSchema.safeParse({
      collection: "PUBLIC",
      files: [{ ...validFile, sha256: "not-a-hash" }],
    });
    expect(result.success).toBe(false);
  });

  it("limits each request to twenty files", () => {
    const result = kbImportBatchSchema.safeParse({
      collection: "CHAT",
      files: Array.from({ length: 21 }, (_, index) => ({ ...validFile, name: `article-${index}.md` })),
    });
    expect(result.success).toBe(false);
  });
});
