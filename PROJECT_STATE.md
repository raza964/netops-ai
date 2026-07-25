# NetOps AI Project State

Last verified: 2026-07-25

## Completed phases

- Phase 1: Authentication, RBAC, and reference data.
- Phase 2: Case management, timeline, approvals, audit logging, and soft deletion.
- Phase 3: Knowledge base.
- Phase 4: Command catalog.
- Phase 5: Semantic search foundation with provider abstraction and lifecycle tests.

## Current phase

Phase 6: AI-assisted case analysis and next-step recommendations.

Implemented in the current working tree:

- Provider-agnostic troubleshooting analysis interface.
- Anthropic Messages API provider with timeouts, response validation, and safe errors.
- Evidence-bounded case prompt using case metadata and the latest 30 timeline entries.
- Transactional AI analysis and recommendation timeline entries.
- Engineer/admin server action, audit event, advisory UI, and closed-case guard.
- Optional `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` configuration.
- AI case-analysis regression test.

## Verification status

Validation must be run after installing the locked dependencies and configuring the existing PostgreSQL test database.

## Next work after Phase 6 verification

- Add retrieval-augmented context from published knowledge-base articles and command entries when semantic search is configured.
- Add explicit user feedback/usefulness tracking for AI recommendations.
- Define the next automation phase only after AI safety and audit behavior are verified.

## Working rules

- Preserve the existing Next.js, Prisma, PostgreSQL, Auth.js, and server-action architecture.
- Do not re-audit completed phases unless affected files change.
- AI output is advisory and must never execute commands or bypass configuration-change approval.
