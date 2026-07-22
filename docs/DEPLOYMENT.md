# Deployment Guide

This guide deploys an application created from the SaaS Starter Kit. Vercel is used as an example, but the required runtime configuration is platform-independent.

## 1. Provision services

1. **PostgreSQL:** Provision a managed PostgreSQL database and save its connection string as `DATABASE_URL`.
2. **Supabase Auth:** Create a Supabase project, copy its URL and anonymous key, then configure Google, GitHub, or email providers in the Supabase dashboard. Add `https://your-domain.example/api/auth/callback` and your local development callback URL to Supabase's redirect allow list.
3. **Stripe (optional):** Create the subscription prices you need, then set `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET`. Configure the subscription webhook endpoint as `https://your-domain.example/api/webhooks/subscription`.
4. **Rate limiting:** Provision Upstash Redis for production and generate a `RATE_LIMIT_HMAC_SECRET` with `openssl rand -hex 32`.
5. **Monitoring (optional):** Create a Sentry project and save the DSN and release-upload credentials.

## 2. Configure environment variables

Set the following in the deployment platform for Preview and Production as appropriate. The complete, commented list is in `.env.example`.

| Category                   | Variables                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required                   | `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                                                                 |
| Production rate limiting   | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_HMAC_SECRET`                                                                              |
| Stripe billing             | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`                                                        |
| Template sales             | `STRIPE_TEMPLATE_HOBBY_PRICE_ID`, `STRIPE_TEMPLATE_PRO_PRICE_ID`, `STRIPE_TEMPLATE_DIRECTOR_PRICE_ID`, `TEMPLATE_FULFILLMENT_SECRET`, `TEMPLATE_FILES_PATH` |
| Template repository access | `GITHUB_ACCESS_TOKEN`, `GITHUB_ORG`                                                                                                                         |
| Monitoring                 | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`                                                                               |

OAuth client secrets are managed by Supabase, not by this app. Do not add `NEXTAUTH_*`, `GOOGLE_CLIENT_*`, or `GITHUB_CLIENT_*` variables for this authentication flow.

## 3. Initialize the database

From a trusted local environment or CI runner:

```bash
npm ci
export DATABASE_URL="postgresql://..."
npm run db:push
# Optional: creates the example plan data
npm run db:seed
```

Prisma 7 uses the PostgreSQL driver adapter configured in `src/lib/prisma.ts`; keep `@prisma/client` and `@prisma/adapter-pg` on the same Prisma version when upgrading.

## 4. Deploy

With a Git integration, connect the repository to the target project, configure the variables above, and let the platform run `npm ci` followed by `npm run build`.

For Vercel CLI:

```bash
npm install --global vercel
vercel login
vercel link
vercel --prod
```

Use a preview deployment to validate the database, Supabase redirect URLs, billing, and webhook signature before promoting a production release.

## 5. Verify after deployment

- Request `/api/health` and confirm `database.status` is `connected`.
- Sign in through `/auth/signin` using a configured Supabase provider.
- Confirm dashboard access for a regular user and `/unauthorized` behavior for a user without the required role.
- Send a signed Stripe test event to `/api/webhooks/subscription` and confirm it is recorded once.
- If template sales are enabled, create and download a test purchase for Hobby, Pro, and Director. Pro and Director can receive GitHub access; Hobby cannot.
- Verify Sentry receives a controlled staging error if monitoring is enabled.

## 6. Rollback and maintenance

- Keep database backups and deployable release identifiers.
- Use the hosting provider's deployment history to roll back application code. Review database changes before rolling back code that relies on newer schema.
- Keep the dependency audit green, regenerate template archives after any source or configuration change, and rerun the release checklist before each distribution.
