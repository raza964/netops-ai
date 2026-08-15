# NetOps AI — Project Status

## Objective

Authenticated network-operations workspace for case management, knowledge capture, command reference, semantic search, and audited AI-assisted troubleshooting. Production-deployed on Cloudflare Workers.

## In Scope

- Auth.js credentials authentication with database-backed RBAC (ADMIN, ENGINEER, VIEWER)
- Troubleshooting cases with timeline, approvals, audit logging, soft deletion
- Knowledge base (articles, categories, import workflow, editorial review)
- Command catalog (vendor/device/technology-scoped commands, risk levels)
- Provider-agnostic semantic search over published KB articles and commands
- Advisory AI case analysis (analysis + next-step recommendation, never executes)
- Cloudflare Workers deployment via OpenNext with custom domain
- CI/CD: lint, typecheck, 108 tests, migrations, Next.js build, OpenNext build, auto-deploy

## Explicitly Out of Scope

- pgvector or native PostgreSQL vector extensions (not available in Cloudflare Workers)
- AI-executed commands or configuration changes (advisory only)
- Network automation (requires AI safety evidence first)
- Static Cloudflare Pages deployment (requires Workers for auth/Server Actions/DB/AI)
- Real-time collaboration, WebSockets, or long-running background jobs
- Multi-tenant isolation (single-tenant workspace)

## Current Verified State (as of 2026-08-15)

- **Repository**: `master` branch, clean working tree, up to date with origin
- **Last commit**: f27482b "Make knowledge ingestion permanent (#19)"
- **CI/CD**: GitHub Actions validated — 108/108 tests pass, lint pass, typecheck pass, migrations pass, Next.js build pass, OpenNext build pass
- **Production deployment**: Active at `https://netops.netvorx.pro` (custom domain, HTTPS verified)
- **Health endpoints**: `/api/health` (liveness) and `/api/ready` (database readiness) operational
- **Database**: PostgreSQL (Neon in production, standard adapter in dev/CI); Prisma 7.9.0
- **Authentication**: Auth.js v5 beta, 8-hour JWT sessions with hourly rotation, DB-backed active/role re-read
- **Security headers**: Global CSP, HSTS, clickjacking, MIME-sniffing, referrer, permissions, COOP; X-Powered-By removed
- **Knowledge import**: 1,314 audited Markdown sources imported (555 lecture, 732 chat-knowledge, 27 restricted); all DRAFT; permanent ADMIN ingestion workflow active
- **Prisma in production**: Operation-isolated clients with per-request disconnect to prevent Cloudflare Worker I/O reuse
- **Dependency advisories**: Transitive advisories in Next.js/Prisma; `npm audit fix --force` prohibited (breaking downgrades); see SECURITY.md

## Completed Milestones

| Phase | Description | Verified |
|-------|-------------|----------|
| 1 | Authentication, RBAC, reference data (Vendor, DeviceType, Technology) | ✅ CI + prod |
| 2 | Case management, timeline, approvals, audit logging, soft deletion | ✅ CI + prod |
| 3 | Knowledge base (articles, categories, import, editorial review) | ✅ CI + prod |
| 4 | Command catalog (searchable reference, vendor/device/tech scoping) | ✅ CI + prod |
| 5 | Semantic search foundation (provider abstraction, lifecycle tests) | ✅ CI + prod |
| 6 | Advisory AI case analysis (analysis + next-step, audited, never executes) | ✅ CI + prod |
| 7 | Production security, CI, health checks, Cloudflare Workers, custom domain, auto GitHub delivery | ✅ CI + prod (2026-07-26) |

## Known Blockers

1. **No local PostgreSQL** — Development/test requires external PostgreSQL instance (Docker, Neon, etc.)
2. **Cloudflare platform hardening incomplete** — Rate limits, WAF rules, Access restrictions, and alerts not yet configured (see Remaining Hardening)
3. **Transitive dependency advisories** — Upstream Next.js/Prisma patches needed; cannot `npm audit fix --force`
4. **Voyage AI / Anthropic API keys** — Optional features (semantic search, AI analysis) unavailable without keys

## Backlog / Later Work

### Platform Hardening (Priority: High — Platform, not release blocker)
1. Enable Cloudflare login/mutation rate limits and WAF managed rules
2. Restrict Worker preview URLs with Cloudflare Access or disable previews
3. Configure Cloudflare error-rate, availability, and security alerts

### Next Product Phase (Priority: Medium — After platform hardening)
1. **RAG from KB/commands** — Retrieval-augmented AI context using published KB articles and command catalog entries
2. **Feedback tracking** — Explicit usefulness/feedback capture for AI recommendations
3. **Network automation** — Only after advisory AI safety and audit controls have production evidence

### Technical Debt / Improvements
- Prisma v7 driver adapter migration (when stable for PostgreSQL)
- Replace in-app vector similarity with pgvector when available in target environment
- Expand test coverage for AI provider error paths and edge cases