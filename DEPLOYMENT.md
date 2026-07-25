# Production deployment

NetOps AI is a dynamic Next.js application with authentication, Server Actions,
AI provider calls, and PostgreSQL. Deploy it to **Cloudflare Workers through the
OpenNext adapter**, not as a static Cloudflare Pages site.

## Required services

- Cloudflare Workers
- Production PostgreSQL reachable from the Worker
- A custom hostname such as `netops.netvorx.pro`
- Optional Voyage AI and Anthropic accounts

Use a managed PostgreSQL provider with TLS, connection pooling, automated
backups, point-in-time recovery, and a region close to the Worker.

## Worker secrets

The deployed Worker must contain these secrets; never place real values in
`wrangler.jsonc` or Git:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`

Optional:

- `VOYAGE_API_KEY`
- `ANTHROPIC_API_KEY`

Set `AUTH_URL=https://netops.netvorx.pro` when the custom domain is active.

## Automatic GitHub deployment

Every pull request runs the full validation gate. After a reviewed change is
merged to `master`, the same gate runs again and the `deploy-production` job:

1. builds the OpenNext Worker,
2. deploys it to Cloudflare,
3. verifies `/api/health`, and
4. verifies database-backed `/api/ready`.

Configure these GitHub Actions repository secrets once:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Cloudflare token should be narrowly scoped to the NetOps AI Worker and must
never be printed in logs or shared in issues, pull requests, or chat.

## Database releases

CI validates every migration against PostgreSQL 17. Production migrations must
run from a trusted release environment before deploying a schema-dependent
application change. Never run development migrations against production.

A future release workflow may automate production migrations after a dedicated,
least-privilege Neon migration credential is stored as a protected production
environment secret.

## Manual emergency deployment

Automatic GitHub deployment is the normal release path. For recovery only:

```bash
npm ci
npx prisma generate
npm run deploy:cloudflare
```

## Cloudflare controls

Before public launch:

1. Attach the production hostname and enforce HTTPS.
2. Restrict `/login` with a rate-limiting rule.
3. Rate-limit authenticated mutation traffic while allowing ordinary page
   navigation.
4. Enable bot protection and WAF managed rules.
5. Keep Worker observability enabled and configure error alerts.
6. Restrict preview deployments with Cloudflare Access.

## Smoke tests

The deployment workflow automatically checks liveness and database readiness.
For a release review, also verify login, RBAC, case creation, approval behavior,
semantic search, AI analysis, audit logging, sign-out, security headers, and the
absence of browser console errors.

## Rollback

Promote the last known-good Worker version in Cloudflare. Database migrations
must be backward-compatible with the previous application version. Restore the
database only for a confirmed data incident, using the managed provider's
point-in-time recovery procedure.
