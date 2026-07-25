# Security

## Supported version

Only the current `master` branch is supported before the first stable release.

## Reporting

Do not open public issues containing credentials, customer data, network
configurations, or exploit details. Report security concerns privately to the
repository owner through GitHub's private vulnerability reporting feature.

## Production controls

- Authentication uses signed Auth.js sessions and database-backed active-user
  and role checks.
- Configuration changes require explicit approval and AI output remains
  advisory; it is never executed automatically.
- Mutating operations are authorized in the data-access layer and recorded in
  the audit log.
- Security headers are applied globally by Next.js.
- Secrets are read from environment variables and must never be committed.
- `/api/health` is a liveness endpoint. `/api/ready` verifies database
  connectivity without exposing connection details.

## Dependency advisories

`npm audit` currently reports transitive advisories in Next.js build/image
dependencies and Prisma CLI internals. Do not run `npm audit fix --force`: its
proposed framework and ORM downgrades are breaking and unsafe. Upgrade to stable
patched Next.js and Prisma releases when available, then run the complete
validation gate.

Until those upstream releases are available:

- Do not add user-controlled CSS or source-map processing.
- Do not add untrusted image uploads or image transformations.
- Do not expose Prisma CLI tooling as an HTTP service.
- Keep Cloudflare rate limiting enabled for login and authenticated mutation
  routes.

## Release security gate

Every production release must pass:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run validate
npm audit --omit=dev
```

Audit findings require an exposure assessment; a forced breaking downgrade is
not an acceptable remediation.
