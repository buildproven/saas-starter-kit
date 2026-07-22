# Release Checklist

Use this checklist before deploying an application built from this kit or distributing a template archive.

## Environment and secrets

- Copy `.env.example` to `.env.local` or configure the equivalent platform variables.
- Set `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Configure Google, GitHub, and email providers in the Supabase dashboard; this project does not use NextAuth environment variables.
- In production, set `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `RATE_LIMIT_HMAC_SECRET`. Rate limiting intentionally fails closed without them.
- Set Stripe and `STRIPE_WEBHOOK_SECRET` only when billing is enabled. Do not put any secret in a `NEXT_PUBLIC_` variable.
- For template sales, set all three price IDs: `STRIPE_TEMPLATE_HOBBY_PRICE_ID`, `STRIPE_TEMPLATE_PRO_PRICE_ID`, and `STRIPE_TEMPLATE_DIRECTOR_PRICE_ID`. Configure GitHub credentials only for Pro and Director repository access.

## Database and billing

- Run `npm run db:push` for a new environment, or apply reviewed migrations if your deployment process uses Prisma migrations.
- Run `npm run db:seed` only when you want the example plan records.
- In Stripe, point the subscription webhook at `https://your-domain.example/api/webhooks/subscription` and verify its signing secret is set.
- Make a staging checkout and confirm the resulting subscription or template download audit is persisted.

## Release gates

```bash
npm ci
npm run type-check:all
npm run lint
npm run format:check
npm test
npm run build
npm run template:package
npm run test:e2e
```

- Confirm every generated archive is present under `template-files/{hobby,pro,director}`.
- Extract the Hobby archive into an empty directory, run `npm ci`, then run `npm run build`. This checks that consumers receive all required configuration files.
- Run `npm audit --audit-level high` and require zero findings. The package manifest pins patched nested PostCSS and Sharp versions through npm overrides until Next.js updates its optional dependency ranges; keep those overrides and the lockfile together, and rerun the full release gate when upgrading Next.js.
- Run your secret scanner against the final archive and verify no `.env*`, credentials, or build output is included.

## Deploy and verify

- Build with the production environment values and deploy.
- Verify `/api/health` reports the database as connected.
- Sign in at `/auth/signin`, exercise a protected dashboard route, and verify the unauthorized screen for an insufficient role.
- Deliver one test template purchase for each published tier: Hobby, Pro, and Director.
- Verify monitoring and Stripe webhook events in the provider dashboards.

## Change notes

Record schema changes, configuration changes, dependency exceptions, and manual rollout or rollback steps with the release. Do not mark a release complete until every relevant item above has evidence.
