import "server-only";
import type { getCaseDetail } from "../data/cases";
import {
  anthropicTroubleshootingProvider,
  type TroubleshootingAnalysis,
  type TroubleshootingProvider,
} from "./provider";

type CaseDetail = NonNullable<Awaited<ReturnType<typeof getCaseDetail>>>;

function clip(value: string | null, limit: number): string {
  if (!value) return "(none)";
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

export function buildCaseAnalysisPrompt(troubleshootingCase: CaseDetail): string {
  const timeline = troubleshootingCase.steps
    .slice(-30)
    .map((step, index) => {
      const detail =
        step.type === "COMMAND"
          ? `command=${clip(step.commandText, 1200)}\noutput=${clip(step.commandOutput, 4000)}`
          : clip(step.note, 2000);
      return `${index + 1}. ${step.type} by ${step.performedBy.name}: ${detail}`;
    })
    .join("\n\n");

  return [
    `Case: ${troubleshootingCase.title}`,
    `Vendor: ${troubleshootingCase.vendor.name}`,
    `Device type: ${troubleshootingCase.deviceType.name}`,
    `Technology: ${troubleshootingCase.technology.name}`,
    `Severity: ${troubleshootingCase.severity}`,
    `Status: ${troubleshootingCase.status}`,
    `Description: ${clip(troubleshootingCase.description, 5000)}`,
    "",
    "Recent timeline evidence:",
    timeline || "(no troubleshooting steps logged)",
    "",
    "Provide a concise evidence-based analysis and one safe, specific next diagnostic step. State uncertainty and missing evidence.",
  ].join("\n");
}

export async function analyzeCase(
  troubleshootingCase: CaseDetail,
  provider: TroubleshootingProvider = anthropicTroubleshootingProvider,
): Promise<TroubleshootingAnalysis & { model: string }> {
  const result = await provider.analyze(buildCaseAnalysisPrompt(troubleshootingCase));
  return { ...result, model: provider.model };
}
