import { z } from "zod";

export const searchSourceTypeValues = ["KB_ARTICLE", "COMMAND_CATALOG_ENTRY"] as const;

export const semanticSearchSchema = z.object({
  q: z.string().trim().min(1, { error: "Enter a search query." }).max(500),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
  type: z.enum(searchSourceTypeValues).optional(),
});
