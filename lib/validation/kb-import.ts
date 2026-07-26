import { z } from "zod";

export const importCollectionValues = ["LECTURE", "CHAT", "RESTRICTED_OPERATIONS"] as const;

const importFileSchema = z.object({
  name: z.string().trim().min(1).max(240),
  relativePath: z.string().trim().min(1).max(500),
  content: z.string().min(1).max(2_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  category: z.string().trim().min(1).max(120),
  sensitivity: z.enum(["STANDARD", "MEDIUM", "HIGH"]),
});

export const kbImportBatchSchema = z
  .object({
    collection: z.enum(importCollectionValues),
    files: z.array(importFileSchema).min(1).max(20),
  })
  .superRefine((value, context) => {
    const totalBytes = value.files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0);
    if (totalBytes > 5_000_000) {
      context.addIssue({
        code: "custom",
        message: "A single import batch cannot exceed 5 MB.",
        path: ["files"],
      });
    }
  });

export type KbImportBatch = z.infer<typeof kbImportBatchSchema>;
