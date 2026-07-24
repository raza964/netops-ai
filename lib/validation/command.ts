import { z } from "zod";

export const riskLevelValues = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const commandStatusValues = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

const optionalId = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.string().optional(),
);

function optionalText(max: number) {
  return z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().trim().max(max).optional(),
  );
}

export const createCommandSchema = z.object({
  title: z.string().trim().min(3, { error: "Title must be at least 3 characters." }).max(200),
  commandText: z.string().trim().min(1, { error: "Command text is required." }).max(2000),
  description: z.string().trim().min(10, { error: "Description must be at least 10 characters." }).max(2000),
  purpose: optionalText(1000),
  expectedOutput: optionalText(5000),
  vendorId: z.string().min(1, { error: "Select a vendor." }),
  deviceTypeId: optionalId,
  technologyId: optionalId,
  riskLevel: z.enum(riskLevelValues, { error: "Select a risk level." }),
  isConfigChange: z.coerce.boolean(),
});

export const updateCommandSchema = createCommandSchema;

export const commandFilterSchema = z.object({
  status: z.enum(commandStatusValues).optional(),
  vendorId: z.string().optional(),
  deviceTypeId: z.string().optional(),
  technologyId: z.string().optional(),
  riskLevel: z.enum(riskLevelValues).optional(),
  isConfigChange: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(200).optional(),
});

export const deleteCommandSchema = z.object({
  confirmation: z.string().trim().min(1, { error: "Confirmation is required." }),
});
