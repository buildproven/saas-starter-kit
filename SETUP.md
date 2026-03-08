# Setup Guide — SaaS Starter Kit

This guide covers installing, configuring, and running the SaaS Starter Kit.

---

## Prerequisites

| Requirement      | Version                           |
| ---------------- | --------------------------------- |
| Node.js          | >= 20 (Volta `.nvmrc` provided)   |
| npm              | >= 10                             |
| PostgreSQL       | 14+ (local or managed, e.g. Neon) |
| Stripe account   | Required for billing              |
| Supabase project | Required for auth                 |

---

## Installation

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env.local

# 3. Fill in required values (see Environment Variables below)
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and populate:

### Required

| Variable                        | Description                  |
| ------------------------------- | ---------------------------- |
| `DATABASE_URL`                  | PostgreSQL connection string |
| `NEXT_PUBLIC_SUPABASE_URL`      | Your Supabase project URL    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key     |

### Billing (required if using Stripe)

| Variable                             | Description                                             |
| ------------------------------------ | ------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                  | Stripe secret key (`sk_live_...` or `sk_test_...`)      |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...` or `pk_test_...`) |
| `STRIPE_WEBHOOK_SECRET`              | Stripe webhook signing secret (`whsec_...`)             |
| `STRIPE_PRICE_STARTER_MONTHLY`       | Stripe price ID for Starter monthly                     |
| `STRIPE_PRICE_STARTER_YEARLY`        | Stripe price ID for Starter yearly                      |
| `STRIPE_PRICE_PRO_MONTHLY`           | Stripe price ID for Pro monthly                         |
| `STRIPE_PRICE_PRO_YEARLY`            | Stripe price ID for Pro yearly                          |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY`    | Stripe price ID for Enterprise monthly                  |
| `STRIPE_PRICE_ENTERPRISE_YEARLY`     | Stripe price ID for Enterprise yearly                   |

### Rate Limiting (required in production)

| Variable                   | Description                                                                  |
| -------------------------- | ---------------------------------------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`   | Upstash Redis REST URL                                                       |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token                                                     |
| `RATE_LIMIT_HMAC_SECRET`   | HMAC secret for client fingerprinting — generate with `openssl rand -hex 32` |

### Optional

| Variable                  | Description                                                 |
| ------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN`  | Sentry DSN for error tracking                               |
| `SENTRY_ORG`              | Sentry organization slug                                    |
| `SENTRY_PROJECT`          | Sentry project slug                                         |
| `SENTRY_AUTH_TOKEN`       | Sentry auth token for source map uploads                    |
| `SENDGRID_API_KEY`        | SendGrid API key for transactional email                    |
| `RESEND_API_KEY`          | Resend API key (alternative to SendGrid)                    |
| `FROM_EMAIL`              | Sender address for transactional email                      |
| `AWS_ACCESS_KEY_ID`       | AWS access key for S3 file uploads                          |
| `AWS_SECRET_ACCESS_KEY`   | AWS secret key                                              |
| `AWS_REGION`              | AWS region (e.g. `us-east-1`)                               |
| `AWS_S3_BUCKET`           | S3 bucket name                                              |
| `NEXT_PUBLIC_APP_URL`     | Full public URL of your app (e.g. `https://yourdomain.com`) |
| `NEXT_PUBLIC_APP_VERSION` | App version string displayed in UI                          |

---

## Database Setup

```bash
# Apply Prisma schema to your database
npm run db:push

# (Optional) Seed subscription plans from Stripe
npm run db:seed
```

> The seed script requires Stripe credentials and live price IDs set in `.env.local`.

---

## Development

```bash
npm run dev           # Start dev server at http://localhost:3000
npm run lint          # ESLint (including security rules)
npm run typecheck     # TypeScript type check
npm test              # Vitest unit/integration tests
npm run test:coverage # Tests with 80% coverage gate
npm run test:e2e      # Playwright end-to-end tests
```

---

## Production Build

```bash
npm run build   # Builds optimized production bundle
npm start       # Starts production server
```

---

## Stripe Webhook Setup

1. In the Stripe dashboard, create a webhook endpoint pointing to `https://yourdomain.com/api/webhooks/subscription`.
2. Subscribe to these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `checkout.session.completed`
3. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

---

## Supabase Auth Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Copy your project URL and anon key to `.env.local`.
3. Enable OAuth providers (Google, GitHub) in the Supabase dashboard under **Authentication > Providers**.
4. Set redirect URL to `https://yourdomain.com/api/auth/callback`.

---

## Deployment

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for a full production deployment playbook covering Vercel, environment variables, and database migration steps.

---

## Support

For support, refer to the documentation included in `docs/` or contact the seller through the channel provided at time of purchase.
