import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getCaseDetail } from "@/lib/data/cases";
import { CommandStepForm } from "./command-step-form";
import { NoteStepForm } from "./note-step-form";
import { StepDecisionButtons } from "./step-decision-buttons";
import { CaseStatusControls } from "./case-status-controls";
import { DeleteCaseForm } from "./delete-case-form";

export default async function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const user = await getCurrentUser();
  const troubleshootingCase = await getCaseDetail(caseId);

  if (!troubleshootingCase) {
    notFound();
  }

  const canAct = user.role === "ENGINEER" || user.role === "ADMIN";
  const canAddSteps = canAct && troubleshootingCase.status !== "CLOSED";

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{troubleshootingCase.title}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {troubleshootingCase.vendor.name} · {troubleshootingCase.deviceType.name} ·{" "}
              {troubleshootingCase.technology.name}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm">
            <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {troubleshootingCase.severity}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {troubleshootingCase.status}
            </span>
          </div>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
          {troubleshootingCase.description}
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Opened by {troubleshootingCase.createdBy.name} on {troubleshootingCase.createdAt.toLocaleString()}
        </p>
      </div>

      {canAct && <CaseStatusControls caseId={troubleshootingCase.id} status={troubleshootingCase.status} />}

      {(troubleshootingCase.status === "RESOLVED" || troubleshootingCase.status === "CLOSED") && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Resolution Summary</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Root Cause</dt>
              <dd className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                {troubleshootingCase.rootCause}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Resolution</dt>
              <dd className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                {troubleshootingCase.resolution}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Verification</dt>
              <dd className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                {troubleshootingCase.verification}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div>
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Troubleshooting Timeline</h2>
        <ol className="mt-3 space-y-3">
          {troubleshootingCase.steps.map((step) => (
            <li
              key={step.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {step.performedBy.name} · {step.createdAt.toLocaleString()}
                </span>
                <span className="uppercase tracking-wide">{step.type.replace("_", " ")}</span>
              </div>

              {step.type === "COMMAND" && (
                <div className="mt-2 space-y-2">
                  <pre className="overflow-x-auto rounded-md bg-zinc-900 p-3 text-xs text-zinc-100">
                    {step.commandText}
                  </pre>
                  {step.commandOutput && (
                    <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                      {step.commandOutput}
                    </pre>
                  )}
                  {step.isConfigChange && (
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Configuration change · {step.approvalState}
                      </span>
                      {step.approvalState === "PENDING" && canAct && step.performedBy.id !== user.id && (
                        <StepDecisionButtons caseId={troubleshootingCase.id} stepId={step.id} />
                      )}
                      {step.approvedBy && <span className="text-zinc-400">by {step.approvedBy.name}</span>}
                    </div>
                  )}
                </div>
              )}

              {step.type === "NOTE" && (
                <p className="mt-2 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{step.note}</p>
              )}

              {step.type === "STATUS_CHANGE" && (
                <p className="mt-2 italic text-zinc-500 dark:text-zinc-400">{step.note}</p>
              )}
            </li>
          ))}
          {troubleshootingCase.steps.length === 0 && (
            <li className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-400 dark:border-zinc-700">
              No steps logged yet.
            </li>
          )}
        </ol>
      </div>

      {canAddSteps && (
        <div className="grid gap-6 lg:grid-cols-2">
          <CommandStepForm caseId={troubleshootingCase.id} />
          <NoteStepForm caseId={troubleshootingCase.id} />
        </div>
      )}

      {user.role === "ADMIN" && (
        <DeleteCaseForm caseId={troubleshootingCase.id} caseTitle={troubleshootingCase.title} />
      )}
    </div>
  );
}
