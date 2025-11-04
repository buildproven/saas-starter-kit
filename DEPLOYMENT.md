# Deployment Guide

This guide explains how to promote the SaaS Starter Template to production (Vercel recommended) and configure the supporting services (database, Stripe, Sentry).

> **Tip**: Make sure your code passes `npm run lint`, `npm run typecheck`, and `npm test` before deploying.

## 1. Prepare Infrastructure

1. **PostgreSQL**
   - Provision a managed instance (e.g., Vercel Postgres, Supabase, Neon, RDS).
   - Whitelist Vercel IPs or set up secure networking as required.

2. **Authentication Providers**
   - Create Google and GitHub OAuth apps (or replace with your preferred providers).
   - Configure callback URLs: `https://your-domain.com/api/auth/callback/<provider>`.

3. **Stripe (optional but recommended)**
   - Create a Stripe account, obtain `STRIPE_SECRET_KEY` and a publishable key.
   - Create Products and recurring Prices for each tier (Starter, Pro, Enterprise) in both monthly and yearly cadences. Record the resulting `price_...` IDs.
   - Set up a webhook endpoint (e.g., `https://your-domain.com/api/webhooks/stripe`) and note the signing secret.

4. **Sentry (optional)**
   - Create a project for monitoring.
   - Collect DSN, organization slug, project slug, and auth token for source map uploads.

## 2. Configure Environment Variables

Populate these variables in your deployment environment (Vercel dashboard → Settings → Environment Variables).

| Category                  | Variables                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Core                      | `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_VERSION`  |
| OAuth                     | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`               |
| Stripe                    | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` |
| Template Sales (optional) | `STRIPE_TEMPLATE_*` price IDs, `TEMPLATE_FULFILLMENT_SECRET`, `TEMPLATE_FILES_PATH`                  |
| Sentry                    | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`                        |
| Optional                  | `NEXT_PUBLIC_BASE_URL` (overrides default `http://localhost:3000` for emails, billing helpers)       |

On Vercel, set variables for **Preview** and **Production** environments. Keep secrets out of version control.

## 3. Database Migration & Seeding

From your local machine (or CI runner):

```bash
npm install
cp .env.example .env.production.local # or set variables via shell
export DATABASE_URL="postgres://..."
npm run db:push
npm run db:seed
```

> ℹ️ The `db:seed` script calls Stripe to fetch product and price metadata. Ensure `STRIPE_SECRET_KEY` and each `STRIPE_PRICE_*` variable are configured and point to existing Stripe prices before running the seed.

`db:seed` inserts the default plans defined in `prisma/seed.ts`. Run it once per environment. If you plan to sell the template itself, make sure the Stripe template price IDs and template asset path (`TEMPLATE_FILES_PATH`) are configured before seeding.

## 4. Deploy to Vercel

### Option A – Git integration

1. Push your branch to GitHub.
2. Import the repo in Vercel and link to the desired project.
3. Configure environment variables when prompted.
4. Vercel will run `npm install && npm run build`. Successful builds auto-deploy.

### Option B – Vercel CLI

```bash
npm install -g vercel
vercel login
vercel link
vercel env pull .env.production.local    # optional sync
vercel --prod
```

During CLI deployment, Vercel reads vars from the dashboard; unconfigured keys will prompt for input.

## 5. Post-Deployment Checklist

- ✅ Verify `/api/health` returns a 200 response and shows `database.status: "connected"`.
- ✅ Sign in via `/auth/signin` using a configured provider.
- ✅ Confirm role-based middleware by visiting `/dashboard` and `/unauthorized`.
- ✅ Test billing flows (checkout/portal) using Stripe test keys.
- ✅ Trigger Sentry error manually (e.g., throw in dev) to confirm reporting.
- ✅ Configure Stripe webhooks to hit `https://your-domain.com/api/webhooks/stripe` (implement handler in `src/app/api/webhooks/stripe/route.ts` if not already).
- ✅ Enable GitHub Actions secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) if you plan to deploy via CI/CD.

## 6. Scaling & Maintenance Tips

- **Migrations**: Prefer `prisma migrate deploy` for controlled releases. Update `package.json` scripts if you adopt migrations instead of `db:push`.
- **Monitoring**: Expand Sentry configuration with release tracking (`NEXT_PUBLIC_APP_VERSION`) and performance monitoring thresholds.
- **Caching**: Add edge caching or ISR to performance-critical routes as you develop user dashboards.
- **Billing**: Replace the mocked `BillingService` methods with actual Stripe calls, secure webhook signature verification, and persist Stripe IDs on relevant models.

## 7. Rollback Strategy

- Keep database backups (managed services usually support automated snapshots).
- Tag releases (e.g., `v1.2.0`) and use Vercel's deployment history to rollback.
- Store environment variable versions separately (1Password/HashiCorp Vault) to revert quickly if needed.

## 8. CI/CD Recommendations

- Extend `.github/workflows/quality.yml` with build and deployment jobs once quality gates pass.
- Cache `~/.npm` and Prisma artifacts to speed up pipelines.
- Consider running `npm run test:coverage` with reporting to guarantee coverage thresholds remain enforced.

When everything is green, you have a production-ready deployment of the SaaS starter.
