import { z } from "zod";

export const articleStatusValues = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

const optionalId = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.string().optional(),
);

export const createArticleSchema = z.object({
  title: z.string().trim().min(3, { error: "Title must be at least 3 characters." }).max(200),
  summary: z.string().trim().min(10, { error: "Summary must be at least 10 characters." }).max(500),
  content: z.string().trim().min(20, { error: "Content must be at least 20 characters." }).max(20000),
  vendorId: optionalId,
  technologyId: optionalId,
  sourceCaseId: optionalId,
});

export const updateArticleSchema = createArticleSchema.omit({ sourceCaseId: true });

export const articleFilterSchema = z.object({
  status: z.enum(articleStatusValues).optional(),
  vendorId: z.string().optional(),
  technologyId: z.string().optional(),
  q: z.string().trim().max(200).optional(),
});

export const deleteArticleSchema = z.object({
  confirmation: z.string().trim().min(1, { error: "Confirmation is required." }),
});
