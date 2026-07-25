import { describe, expect, it } from "vitest";
import { buildCaseAnalysisPrompt, analyzeCase } from "@/lib/ai/case-analysis";
import { getCaseDetail, addCommandStep } from "@/lib/data/cases";
import { createTestCase, createTestUser } from "./helpers/db";

describe("AI case analysis", () => {
  it("builds bounded evidence context and returns provider output with its model", async () => {
    const engineer = await createTestUser();
    const created = await createTestCase(engineer.id);
    await addCommandStep({
      caseId: created.id,
      commandText: "show interfaces terse",
      commandOutput: "ge-0/0/0 up down",
      isConfigChange: false,
      performedById: engineer.id,
    });
    const detail = await getCaseDetail(created.id);
    if (!detail) throw new Error("Test case was not found.");

    const prompt = buildCaseAnalysisPrompt(detail);
    expect(prompt).toContain("show interfaces terse");
    expect(prompt).toContain("ge-0/0/0 up down");

    const result = await analyzeCase(detail, {
      model: "test-model",
      analyze: async () => ({
        analysis: "The physical interface is up but the protocol is down.",
        recommendedNextStep: "Inspect protocol and peer state before changing configuration.",
      }),
    });
    expect(result.model).toBe("test-model");
    expect(result.analysis).toContain("protocol is down");
  });
});
