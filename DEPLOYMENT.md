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

## Required secrets

Set secrets with Wrangler; never place real values in `wrangler.jsonc`:

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put AUTH_SECRET
```

Optional:

```bash
npx wrangler secret put VOYAGE_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
```

Set `AUTH_URL=https://netops.netvorx.pro` and `ANTHROPIC_MODEL` as non-secret
Worker variables (the latter only when overriding the default).
Generate `AUTH_SECRET` with `openssl rand -base64 32`.

## Database release

Run migrations from CI or a trusted administration host before deploying:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

Never run development migrations against production.

## Validate and deploy

```bash
npm run validate
npm run upload:cloudflare
```

The upload command creates a Worker version without immediately moving
production traffic. Smoke-test the version, then promote it in Cloudflare.
For a direct first deployment:

```bash
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

After deployment:

```bash
curl -fsS https://netops.netvorx.pro/api/health
curl -fsS https://netops.netvorx.pro/api/ready
curl -I https://netops.netvorx.pro/login
```

Verify login, RBAC, case creation, approval behavior, semantic search, AI
analysis, audit logging, sign-out, security headers, and the absence of browser
console errors.

## Rollback

Promote the last known-good Worker version in Cloudflare. Database migrations
must be backward-compatible with the previous application version. Restore the
database only for a confirmed data incident, using the managed provider's
point-in-time recovery procedure.
