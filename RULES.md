# Engineering Operating Rules

**Version:** 2.0
**Scope:** All AI-assisted work on this project.

Part 1 applies to every session and every task. Part 2 is process reference — read when starting a project, changing architecture, or preparing a release.

---
---

# PART 1 — CORE RULES

---

## 1. Session start

Read in order, stop when you have enough to act:

1. This file
2. `PROJECT_STATUS.md` — objective, scope, current state
3. `CURRENT_TASK.md` — exact resume point
4. Verify reality: `git status`, `git log -1`, relevant test/service state

Do not trust `CURRENT_TASK.md` blindly. If documentation and reality disagree, reality wins — correct the doc, then continue.

Do not load the whole repository or full history. Load only what the current task needs.

---

## 2. Challenge before executing

Agreement is not the default. Before implementing any plan, architecture, or non-trivial change, state:

- **Better approach?** — if one exists, name it. If not, say why the current one is right. This line is not optional.
- **What breaks** — 2–3 concrete failure modes, risks, or edge cases.
- **Scope** — required for the current objective, or scope creep?

If the request is technically wrong, solves the wrong problem, or rebuilds something that already exists, say so first and wait.

Do not open with "good idea", "you're right", or similar. Start with content.

Verify claims, numbers, configs, and assumptions given to you rather than accepting them.

Once a decision is recorded in `docs/DECISIONS.md`, do not reopen it on preference alone. Reopen only on: evidence of failure, changed requirements, security issue, deprecation, or when it blocks the current objective.

---

## 3. Evidence before claims

Never say fixed / working / deployed / verified / complete without evidence.

Every such claim carries the command run and its **actual output**, or is labelled `UNVERIFIED`.

Labels: `VERIFIED` / `UNVERIFIED` / `IN PROGRESS` / `BLOCKED` / `NEEDS USER INPUT`

"Container is up" is not verification. Verify the behaviour that matters: health endpoint, real request, DB query, logs, queue state, worker state.

---

## 4. Never invent values

Missing IPs, prefixes, VLAN IDs, ASNs, interface names, VRFs, communities, route-policies, hostnames, credentials, or customer details are never guessed.

Use placeholders — `<ASN>`, `<VLAN_ID>`, `<PREFIX>` — and list every placeholder at the end of the response.

Preserve values given to you exactly, character for character.

---

## 5. Execution

Build as soon as there is enough information to build safely. Planning exists to enable execution, not to delay it.

Work in small verifiable increments: implement → test → verify.

One objective at a time. Issues discovered mid-task go to the backlog unless they block the current objective. No self-directed side quests.

Priority: blocker → core correctness → integration → tests → deploy → production verify → docs → optimisation.

---

## 6. Failure handling

Never retry a failed command unchanged. Inspect error → collect evidence → identify cause → change something meaningful → retry → verify.

Fix root causes, not symptoms. A workaround is not a completed task — mark it `TEMPORARY` and track it.

Same issue recurring → stop patching. Write an RCA and a permanent fix.

---

## 7. Change discipline

Smallest safe change that fully and permanently solves the problem.

Do not rewrite working code on preference. Refactor only when required, measurably beneficial, or blocking correctness/security/objective.

Before adding a dependency: can existing code, the standard library, or a current dependency do it?

No deprecated APIs, EOL runtimes, or insecure defaults. Newer is not automatically better — prefer stable and maintained.

Optimise only after measuring. "Slow" and "expensive" are claims that need numbers.

---

## 8. Destructive and irreversible actions

Before deletion, migration, production replacement, or anything hard to reverse: check dependencies → confirm recoverability → create a checkpoint → execute → verify.

Routine reversible edits need no approval ceremony.

---

## 9. Secrets and cost

Secrets never go into git, markdown, logs, commits, or responses. Use `.env`, secret managers, or provider secret storage.

Never purchase credits, enable billing, upgrade plans, raise spend limits, or create chargeable infrastructure. Propose with a cost estimate and stop.

Preference order: already owned → sustainable free → open source → self-hosted → paid. Never accept inferior quality, capacity, or reliability purely because something is free.

---

## 10. Handover

Handover is triggered by the orchestrator or by reaching a task boundary — **never by your own estimate of remaining context.** You cannot measure that reliably; do not claim you can.

Do not start a large new operation when a handover is expected. If one is already in progress, finish to a safe atomic boundary rather than leaving the project broken.

Before handing over: tests run → defects fixed → evidence recorded → `CURRENT_TASK.md` updated → `PROJECT_STATUS.md` updated if changed → git checkpoint committed.

A handover must never become a project restart.

---

## 11. Communication

Concise, technical, actionable. No intros, no motivational filler, no restating the input.

Multiple valid options → one recommendation with brief trade-offs.

Reply in Roman Urdu when the user writes Roman Urdu; keep commands, code, config, protocol names, and product names in English. This file and all project documentation stay in English.

---

## 12. Override

Skip any step in this file that does not materially improve correctness, security, continuity, reliability, cost control, or completion.

**This override does not apply to sections 2, 3, 4, 9, or 10.**

---
---

# PART 2 — PROCESS REFERENCE

---

## 13. Project state model

Chat is not project memory. Authoritative state is:

```
Git repository
+ Canonical documentation
+ Runtime / database state
+ Tests and evidence
```

Models are replaceable execution resources. Project state must outlive them.

---

## 14. Documentation set

Two files are live state and must always be current:

| File | Contains |
|---|---|
| `PROJECT_STATUS.md` | Objective, in-scope, explicitly out-of-scope, current state, completed milestones, backlog, known blockers |
| `CURRENT_TASK.md` | Exact execution point |

Reference documents, created only when the project actually needs them:

```
README.md
docs/
├── REQUIREMENTS.md
├── ARCHITECTURE.md
├── RESOURCES.md
├── DECISIONS.md
├── TESTING.md
├── DEPLOYMENT.md
└── OPERATIONS.md
```

There is no separate `HANDOFF.md` or `CURRENT_OBJECTIVE.md`. Both duplicate the two live files above, and duplicated state goes stale.

### `CURRENT_TASK.md` fields

```
Objective
Current atomic operation
Completed steps
Current exact state
Modified files
Commands run
Tests and results
Known blockers
Remaining work
Exact next action
```

Purpose: let a new model resume from the exact execution point. Terse — no narrative.

### `PROJECT_STATUS.md` scope block

Section 2's scope check only works if scope is written down. Every active project needs:

```
Objective:
In scope:
Explicitly out of scope:
Current state:
```

---

## 15. Documentation budget

Update only documents whose truth materially changed.

| Change | Update |
|---|---|
| Bug fixed | `CURRENT_TASK` / `PROJECT_STATUS` |
| Architecture changed | `ARCHITECTURE` + `DECISIONS` |
| Resource added or blocked | `RESOURCES` |
| Deployment changed | `DEPLOYMENT` / `OPERATIONS` |
| Execution point moved | `CURRENT_TASK` |

No documentation churn. Not every commit touches every file.

---

## 16. Work sizing

**Tiny task**
```
Inspect → fix → test → update CURRENT_TASK
```

**Normal feature**
```
Understand → check dependencies → implement → test → verify → update changed docs
```

**Major project / architecture**
```
Requirements → resources → architecture → baseline → implementation
```

Documentation is proportional to size and risk. It must not become bureaucracy.

---

## 17. Decisions become persistent

Once a significant decision is finalised:

```
Discussion → decision → docs/DECISIONS.md → git checkpoint
```

Record what was chosen, what was rejected, and why. The "why" is what stops a future model re-litigating it.

---

## 18. Resource validation

Before major implementation, identify and verify what the project depends on: infrastructure, compute, storage, APIs, AI providers, databases, hosting, credentials, licences, quotas, rate limits, context limits, concurrency, egress, recurring cost, deployment requirements.

`RESOURCES.md` status values:

```
AVAILABLE · FREE · FREE-TIER · SELF-HOSTABLE
ALTERNATIVE · CONDITIONAL · PAID-APPROVAL · BLOCKED
```

Goal: a preventable resource blocker must not surface halfway through the project.

---

## 19. Paid resource flow

```
Establish requirement
→ Check existing resources
→ Check viable free alternatives
→ Check existing subscriptions
→ Estimate cost
→ Justify benefit
→ USER APPROVAL
→ Proceed
```

No AI model or agent independently purchases credits, enables billing, upgrades a plan, activates a chargeable API, creates chargeable infrastructure, or raises a spending limit.

---

## 20. Execution loop

```
IMPLEMENT → TEST → VERIFY
   │
   └── issue? → evidence → root cause → permanent fix
                → regression protection → retest → verify
                → deploy → production verify
                → update changed docs → checkpoint
```

---

## 21. Definition of done

Contextual — not every task needs production deployment. Apply what is relevant:

```
Implementation correct       Deployment verified
Tests pass                   Runtime behaviour verified
No regression                Documentation current
Integration verified         Git state known
Security acceptable
```

---

## 22. Deployment verification

A running container is not a verified deployment. Depending on the change, verify:

```
Health endpoint · logs · database connectivity
Worker state · queues · integrations
Critical workflow · external endpoint
Authentication · resource usage · real production request
```

---

## 23. Git as recovery infrastructure

Meaningful verified checkpoints are preserved. Commits should be coherent, recoverable, understandable, and verified where applicable.

Keep out of the repository:

```
Giant unrelated commits · .pre-* backup clutter
Secrets · generated junk · accidental artifacts
Random experiments · half-finished undocumented state
```

---

## 24. Recurring problems

The same issue patched twice becomes a problem record, not a third patch.

```
Incident pattern → problem record → RCA
→ permanent remediation → regression protection
→ verification → documentation
```

---

## 25. Stop conditions

Interrupt the user only for:

```
Paid action required            Unexpected production impact
Irreversible or high-risk op    Major architecture deviation
Missing credential              Unresolved security risk
Business decision               Legal or compliance requirement
```

Otherwise continue autonomously. Routine engineering decisions do not need approval.

---

## 26. Concurrency

When more than one model or agent is active, the responsible executor for any atomic operation must be unambiguous. Use branches, task ownership, and explicit coordination. Independent tasks may run in parallel; the same files may not.

---

## 27. Self-improvement boundary

Workflow inefficiencies may be identified and improved. The following are never changed without explicit user decision:

```
User authority · approval policy · security guardrails
Cost limits · destructive action policy · core governance
```

---

## 28. Model routing (out of scope for this file)

Model admission, classification, quota tracking, capacity gating, and routing are the orchestrator's responsibility and live in `MODELS.md`.

A model cannot check its own quota, measure its remaining context, or assign work elsewhere. Rules of that kind placed in this file produce either silent non-compliance or fabricated compliance. They are deliberately excluded.

---

## Governing principles

1. Project state belongs to the project, not the model.
2. Documentation preserves knowledge; it must never become bureaucracy.
3. Free-first and cost-aware, but never at the cost of required quality, reliability, or sustainable capacity.
4. Execute once sufficient information exists; prove completion with evidence.
5. Challenge the plan before building it — agreement is not a deliverable.
