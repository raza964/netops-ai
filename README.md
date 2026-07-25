# NetOps AI

Authenticated network-operations workspace for case management, knowledge
capture, command reference, semantic search, and audited AI-assisted
troubleshooting.

## Capabilities

- Auth.js credentials authentication with database-backed RBAC
- Troubleshooting cases, timeline, approvals, and audit logging
- Knowledge base and vendor-aware command catalog
- Provider-agnostic semantic search
- Advisory AI case analysis that never executes commands
- Cloudflare Workers deployment through OpenNext

See [PROJECT_STATE.md](PROJECT_STATE.md) for verified phase status,
[SECURITY.md](SECURITY.md) for security policy, and
[DEPLOYMENT.md](DEPLOYMENT.md) for the production runbook.

## Local setup

Requirements: Node.js 22 and PostgreSQL.

```bash
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Seed only a non-production database when development reference data is needed:

```bash
npx prisma db seed
```

## Validation

Use a dedicated PostgreSQL test database whose name contains `_test`, configured
in `.env.test`.

```bash
npm run validate
```

The GitHub Actions gate repeats dependency installation, migrations, lint, type
checking, all database tests, the Next.js production build, and the Cloudflare
OpenNext build.

## Cloudflare

```bash
cp .dev.vars.example .dev.vars
npm run preview:cloudflare
npm run upload:cloudflare
```

Do not deploy this application as a static Pages site. Its authentication,
Server Actions, PostgreSQL access, and AI integrations require the Cloudflare
Workers/OpenNext runtime.
