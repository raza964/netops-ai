# NetOps AI Project State

Last verified: 2026-07-25

## Completed phases

- Phase 1: Authentication, RBAC, and reference data.
- Phase 2: Case management, timeline, approvals, audit logging, and soft deletion.
- Phase 3: Knowledge base.
- Phase 4: Command catalog.
- Phase 5: Semantic search foundation with provider abstraction and lifecycle tests.
- Phase 6: Audited, advisory AI-assisted case analysis and next-step recommendations.
- Phase 7: Production security, CI, health checks, and Cloudflare Workers deployment foundation.

## Phase 7 production work

- Global CSP, HSTS, clickjacking, MIME-sniffing, referrer, permissions, and
  cross-origin opener protections.
- Removed the identifying `X-Powered-By` response header.
- Eight-hour Auth.js sessions with hourly rotation; active status and roles are
  still re-read from PostgreSQL on protected requests.
- Public liveness and database-backed readiness endpoints with no-store
  responses and non-sensitive error output.
- GitHub Actions validation with PostgreSQL 17, locked installation, migrations,
  lint, type checking, 108 application tests, Next.js build, and OpenNext build.
- Reproducible Cloudflare Workers/OpenNext configuration with pinned adapter and
  Wrangler versions.
- Explicit Edge runtime for the cookie-only Next.js Proxy, keeping database
  authorization in server-side DAL code.
- Production deployment, secret management, rollback, dependency-advisory, and
  security documentation.

## Verification status

- Prisma Client generation: passed locally.
- ESLint: passed locally.
- TypeScript: passed locally.
- Next.js production build: passed locally; 20 application routes generated.
- Existing Ubuntu gate before Phase 7: 108/108 tests passed.
- Phase 7 database tests and OpenNext Linux build: enforced by the new CI
  workflow and must be green before merge.

OpenNext's Windows build is not a reliable release signal; the adapter itself
recommends Linux/WSL. Production and CI use Linux.

## Dependency advisory status

The current stable Next.js and Prisma releases contain transitive packages with
published advisories. `npm audit fix --force` proposes breaking framework/ORM
downgrades and must not be used. See `SECURITY.md` for exposure controls and the
upgrade policy.

## Production release blockers

These are infrastructure actions, not missing application code:

1. Provision production PostgreSQL with TLS, pooling, backups, and
   point-in-time recovery.
2. Configure Cloudflare Worker secrets and the production hostname.
3. Enable Cloudflare login/mutation rate limits, WAF rules, preview access
   control, and alerts.
4. Run the first migration, deploy a Worker version, complete smoke tests, and
   promote it.

## Next product phase

- Retrieval-augmented AI context from published knowledge-base and command
  entries.
- Explicit usefulness/feedback tracking for AI recommendations.
- Network automation only after advisory AI safety and audit controls have
  production evidence.

## Working rules

- Preserve the existing Next.js, Prisma, PostgreSQL, Auth.js, and server-action architecture.
- Do not re-audit completed phases unless affected files change.
- AI output is advisory and must never execute commands or bypass configuration-change approval.
- Production releases require green CI and the checklist in `DEPLOYMENT.md`.
