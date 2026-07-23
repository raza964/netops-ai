import { z } from "zod";

export const severityValues = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const caseStatusValues = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export const createCaseSchema = z.object({
  title: z.string().trim().min(3, { error: "Title must be at least 3 characters." }).max(200),
  description: z.string().trim().min(10, { error: "Description must be at least 10 characters." }).max(5000),
  vendorId: z.string().min(1, { error: "Select a vendor." }),
  deviceTypeId: z.string().min(1, { error: "Select a device type." }),
  technologyId: z.string().min(1, { error: "Select a technology." }),
  severity: z.enum(severityValues, { error: "Select a severity." }),
});

export const caseFilterSchema = z.object({
  status: z.enum(caseStatusValues).optional(),
  vendorId: z.string().optional(),
  technologyId: z.string().optional(),
  severity: z.enum(severityValues).optional(),
});

export const addCommandStepSchema = z.object({
  commandText: z.string().trim().min(1, { error: "Command is required." }).max(2000),
  commandOutput: z.preprocess(
    (value) => (value === null || value === undefined ? "" : value),
    z.string().trim().max(20000),
  ),
  isConfigChange: z.coerce.boolean(),
});

export const addNoteStepSchema = z.object({
  note: z.string().trim().min(1, { error: "Note text is required." }).max(5000),
});

export const resolveCaseSchema = z.object({
  rootCause: z.string().trim().min(5, { error: "Root cause is required." }).max(5000),
  resolution: z.string().trim().min(5, { error: "Resolution is required." }).max(5000),
  verification: z.string().trim().min(5, { error: "Verification steps are required." }).max(5000),
});

export const deleteCaseSchema = z.object({
  confirmation: z.string().trim().min(1, { error: "Confirmation is required." }),
});
