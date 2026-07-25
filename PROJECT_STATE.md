# NetOps AI Project State

Last verified: 2026-07-26

## Completed phases

- Phase 1: Authentication, RBAC, and reference data.
- Phase 2: Case management, timeline, approvals, audit logging, and soft deletion.
- Phase 3: Knowledge base.
- Phase 4: Command catalog.
- Phase 5: Semantic search foundation with provider abstraction and lifecycle tests.
- Phase 6: Audited, advisory AI-assisted case analysis and next-step recommendations.
- Phase 7: Production security, CI, health checks, Cloudflare Workers deployment,
  custom-domain release, and automatic GitHub delivery foundation.

## Phase 7 production work

- Global CSP, HSTS, clickjacking, MIME-sniffing, referrer, permissions, and
  cross-origin opener protections.
- Removed the identifying `X-Powered-By` response header.
- Eight-hour Auth.js sessions with hourly rotation; active status and roles are
  still re-read from PostgreSQL on protected requests.
- Public liveness and database-backed readiness endpoints with no-store
  responses and non-sensitive public errors plus sanitized server logging.
- Neon production connections use Prisma's official serverless adapter; local
  development and CI retain the standard PostgreSQL adapter.
- Production Prisma clients are isolated per ORM operation and disconnected
  after completion so Cloudflare request-bound native I/O is never reused by a
  later Worker request.
- GitHub Actions validation with PostgreSQL 17, locked installation, migrations,
  lint, type checking, 108 application tests, Next.js build, and OpenNext build.
- Validated `master` commits automatically deploy to Cloudflare and must pass
  post-deployment liveness and database-readiness smoke checks on the custom
  production domain.
- Reproducible Cloudflare Workers/OpenNext configuration with pinned adapter and
  Wrangler versions.
- Edge Middleware for the cookie-only optimistic route gate, keeping database
  authorization in server-side DAL code. Next.js 16's Node-only `proxy.ts`
  cannot be emitted by the current Cloudflare adapter.
- Production deployment, secret management, rollback, dependency-advisory, and
  security documentation.

## Verification status

- Prisma Client generation: passed in CI.
- ESLint: passed in CI.
- TypeScript: passed in CI.
- PostgreSQL migrations: passed in CI.
- Application test suite: 108/108 passed in CI.
- Next.js production build: passed in CI.
- Cloudflare OpenNext production bundle: passed in CI.
- Cloudflare Worker deployment: active at `https://netops.netvorx.pro`.
- Automatic delivery workflow: verified end to end on 2026-07-26; validated
  `master` commits deploy without Ubuntu-side commands, then pass live liveness
  and Neon database-readiness checks on the custom domain.
- Prisma uses the standard client output and OpenNext workerd exports, avoiding
  runtime WASM compilation that Cloudflare Workers does not permit.
- Cloudflare custom domain and HTTPS: active and verified.
- First production administrator: created directly in the production database
  with a bcrypt password hash; role and active status verified.
- Authenticated smoke test: sign-out, fresh credential sign-in, dashboard,
  cases, knowledge base, command catalog, and admin routes passed on 2026-07-26.

OpenNext's Windows build is not a reliable release signal; the adapter itself
recommends Linux/WSL. Production and CI use Linux.

## Dependency advisory status

The current stable Next.js and Prisma releases contain transitive packages with
published advisories. `npm audit fix --force` proposes breaking framework/ORM
downgrades and must not be used. See `SECURITY.md` for exposure controls and the
upgrade policy.

## Remaining production hardening

1. Enable Cloudflare login/mutation rate limits and WAF rules.
2. Restrict Worker preview URLs with Cloudflare Access or disable previews when
   the release workflow no longer needs them.
3. Configure Cloudflare error-rate, availability, and security alerts.

These are platform hardening tasks rather than application release blockers;
the custom-domain production application, database, authentication, CI/CD, and
health gates are active and verified.

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
