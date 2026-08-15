# Agent Entry Point — NetOps AI

## Mandatory Sequence

1. **RULES.md** — Read Engineering Operating Rules v2.0 (canonical copy at `/home/raza/projects/raza-ai-control/RULES.md`)
2. **PROJECT_STATUS.md** — Read verified project state, scope, milestones, blockers
3. **CURRENT_TASK.md** — Read current atomic operation and exact next action
4. **Git/runtime verification** — `git status`, `git log --oneline -5`, verify deployment at `https://netops.netvorx.pro`
5. **Relevant docs only** — Read only docs directly relevant to the current task
6. **Execute** — Perform the exact next atomic action from CURRENT_TASK.md

## Project Context

NetOps AI is a production-deployed Next.js 16 application (Auth.js v5, Prisma ORM, PostgreSQL) on Cloudflare Workers via OpenNext at `https://netops.netvorx.pro`. Capabilities: authenticated case management, knowledge base, command catalog, semantic search, advisory AI case analysis. All 7 phases complete; CI green (108 tests); custom domain verified 2026-07-26.

## Current Phase

Reconciliation in progress. Highest-priority objective: **Platform hardening** (Cloudflare rate limits, WAF, Access, alerts) per PROJECT_STATE.md §74-83. Next product phase: RAG from KB/commands, feedback tracking, network automation (after AI safety evidence).

## Quick References

- `PROJECT_STATUS.md` — Verified state, milestones, blockers, backlog
- `CURRENT_TASK.md` — Active atomic task
- `PROJECT_STATE.md` — Detailed phase history (source of truth for completed work)
- `DEPLOYMENT.md` — Production runbook
- `SECURITY.md` — Security policy and release gate
- `README.md` — Setup and validation commands
- `prisma/schema.prisma` — Database schema (Phases 1-5)
- `lib/ai/provider.ts` — AI provider abstraction (Phase 6)
- `lib/embeddings/provider.ts` — Embedding provider abstraction (Phase 5)