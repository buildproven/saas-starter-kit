# Release Checklist

Use this checklist before shipping to production or distributing the template.

## Environment & Secrets

- Copy `.env.example` → `.env.local` (or platform env) and fill **required** keys: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_HMAC_SECRET`.
- Configure optional integrations as needed: Stripe keys + webhook secret, Sentry DSN/org/project, email provider, GitHub org/token for template fulfillment, AWS for uploads.
- Verify rate limiting keys exist in prod (no in-memory fallback).

## Database

- `npm run db:push` to sync schema; run `npm run db:seed` only if demo data is desired.
- For production migrations, create/inspect SQL before apply; keep backups.

## Quality Gates

**Quick audit (pre-commit/PR):**

```bash
npm run audit:quick    # types + lint + format + tests (~1-2 min)
```

**Full audit (pre-merge/deploy):**

```bash
npm run audit:full     # ALL static checks (~5-10 min)
```

**Release audit (production deploy):**

```bash
npm run audit:release  # audit:full + E2E + perf (~15-20 min)
```

**Individual checks by category:**

| Category           | Command          | What It Checks                              |
| ------------------ | ---------------- | ------------------------------------------- |
| **Code Quality**   |                  |                                             |
|                    | `audit:types`    | TypeScript strict (src + tests)             |
|                    | `audit:lint`     | ESLint (unused vars, `any`, security rules) |
|                    | `audit:format`   | Prettier formatting consistency             |
|                    | `audit:styles`   | Stylelint CSS/SCSS                          |
| **Testing**        |                  |                                             |
|                    | `audit:tests`    | Vitest unit tests                           |
|                    | `audit:coverage` | Coverage threshold (80%)                    |
|                    | `audit:e2e`      | Playwright E2E browser tests                |
| **Security**       |                  |                                             |
|                    | `audit:deps`     | npm vulnerabilities + outdated packages     |
|                    | `audit:secrets`  | Gitleaks + TruffleHog secret scanning       |
|                    | `audit:licenses` | OSS license compliance                      |
| **Build & Bundle** |                  |                                             |
|                    | `audit:build`    | Production build verification               |
|                    | `audit:bundle`   | Bundle size analysis                        |
| **Data**           |                  |                                             |
|                    | `audit:schema`   | Prisma schema + migration status            |
| **Documentation**  |                  |                                             |
|                    | `audit:docs`     | Documentation validation                    |
| **Performance**    |                  |                                             |
|                    | `audit:perf`     | Lighthouse CI metrics                       |

## Security

- `npm run security:deps` (npm audit high/critical)
- `npm run security:secrets` (Gitleaks)
- `npm run security:all` (both above)
- `npm run test:secrets` (TruffleHog)
- Review Sentry and Stripe keys for environment correctness before enabling.

## Build & Deploy

- `npm run build` (uses Next.js production build; ensure env values are present even though build skips health checks).
- Configure platform env vars (database, NextAuth, Stripe, Sentry, Upstash, email).
- Set Stripe webhook endpoint + secret, and enable HTTPS URLs in OAuth providers.

## Template Sales Flow (if selling)

- Set `STRIPE_TEMPLATE_*` price IDs, `GITHUB_ORG`, and `GITHUB_ACCESS_TOKEN`.
- Run the template smoke test: `npm test -- src/app/api/template-sales/smoke.test.ts`.
- Manually verify a test checkout in staging and confirm download audits are recorded.

## PR/Change Notes

- Document schema changes, breaking config changes, and any manual post-deploy steps in the PR description or release notes.
