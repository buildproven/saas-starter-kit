# SaaS Starter Kit

A batteries-included SaaS foundation built with Next.js 16 (App Router), Prisma, and Stripe-ready billing flows. Launch multi-tenant products with authentication, RBAC, subscriptions, and modern DX defaults already wired together.

---

> **Maintainer & Ownership**
> This project is maintained by **Vibe Build Lab LLC**, a studio focused on AI-assisted product development, micro-SaaS, and "vibe coding" workflows for solo founders and small teams.
> Learn more at **https://www.vibebuildlab.com**.

---

## Features

- **Next.js App Router** with hybrid rendering, server actions, and middleware-driven RBAC
- **Authentication & Authorization** using Supabase Auth (Google/GitHub/email), Prisma for user data, and role-aware middleware (`USER`, `ADMIN`, `SUPER_ADMIN`)
- **Multi-tenant data model** with Organizations, Projects, API Keys, Plans, and Usage tracking powered by Prisma & PostgreSQL
- **Billing scaffolding** with Stripe-compatible helpers (checkout, billing portal, subscription enforcement)
- **Production tooling**: Vitest + Testing Library + Playwright, ESLint (security plugin), Prettier, Tailwind v4 (shadcn/ui tokens), Sentry, Husky + lint-staged, and GitHub Actions
- **State management & UI**: Zustand global store, shadcn-style component primitives, and Lucide iconography
- **Smart Test Strategy**: Intelligent risk-based pre-push validation that adapts to your changes

## Target Users

- **Solo founders** building their first SaaS product
- **Small teams** who want a production-ready starting point without reinventing auth, billing, and deployment
- **Agencies** shipping client projects faster with a proven foundation

## Licensing

For commercial packages and pricing, visit [vibebuildlab.com](https://vibebuildlab.com).

### License

**Dual Licensed:**

- **Open Source**: MIT License (see [LICENSE](./LICENSE)) - Free for personal and commercial use
- **Commercial**: Premium packages include additional rights and restrictions (see [COMMERCIAL_LICENSE.md](./COMMERCIAL_LICENSE.md))

## Tech Stack

| Layer          | Technology                                  |
| -------------- | ------------------------------------------- |
| **Framework**  | Next.js 16 (App Router)                     |
| **Language**   | TypeScript 5+                               |
| **Database**   | PostgreSQL 14+ via Prisma ORM               |
| **Auth**       | Supabase Auth (OAuth + email)               |
| **Payments**   | Stripe (checkout, billing portal, webhooks) |
| **Styling**    | Tailwind CSS v4 + shadcn/ui                 |
| **State**      | Zustand                                     |
| **Testing**    | Vitest + Testing Library + Playwright       |
| **Monitoring** | Sentry                                      |
| **CI/CD**      | GitHub Actions                              |

## Getting Started

### Prerequisites

- Node.js >= 20 (Volta and `.nvmrc` provided)
- PostgreSQL 14+ (local or managed)
- npm >= 10
- Stripe + Sentry credentials (optional in local dev)

### Installation

```bash
# Clone & install
git clone https://github.com/vibebuildlab/saas-starter-kit.git
cd saas-starter-kit
npm install

# Configure environment
cp .env.example .env.local
# Fill in database, Supabase, Stripe, and Sentry values

# Database setup
npm run db:push        # Apply Prisma schema
npm run db:seed        # (Optional) Seed plans & demo data

# Start development
npm run dev
```

Visit `http://localhost:3000` and sign in with any configured OAuth provider.

### Environment Variables

Key environment groups to configure:

- **Supabase** – `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required)
- **Database** – `DATABASE_URL` (required)
- **Stripe** – `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Sentry** – `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- **Rate limiting (prod required)** – `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (falls back to memory in dev/tests only)

Refer to `.env.example` for the full list.

### Development Commands

| Command                    | Purpose                                     |
| -------------------------- | ------------------------------------------- |
| `npm run dev`              | Start dev server with hot reload            |
| `npm run lint`             | ESLint (including security rules)           |
| `npm run typecheck`        | TypeScript validation                       |
| `npm test`                 | Vitest suite (unit/integration)             |
| `npm run test:coverage`    | Vitest with coverage (80% global threshold) |
| `npm run test:e2e`         | Playwright end-to-end smoke tests           |
| `npm run db:push`          | Apply Prisma schema                         |
| `npm run db:seed`          | Seed demo data                              |
| `npm run security:audit`   | npm audit high severity gate                |
| `npm run security:secrets` | Secret scanning via Gitleaks                |
| `npm run security:config`  | Security configuration lint                 |

See `docs/RELEASE-CHECKLIST.md` for pre-release steps.

## Usage Examples

### Protecting an API Route

```typescript
import { getUser } from '@/lib/auth/get-user'

export async function GET(req: Request) {
  const user = await getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }
  // Your protected logic here - user has id, email, name, role
}
```

### Creating a Subscription Checkout

```typescript
import { createCheckoutSession } from '@/lib/billing'

const session = await createCheckoutSession({
  priceId: process.env.STRIPE_PRICE_PRO,
  customerId: user.stripeCustomerId,
  successUrl: '/dashboard',
  cancelUrl: '/pricing',
})
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and strategic direction.

## Documentation

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) – Module boundaries, data flow, and extension points
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) – Production deployment playbook
- [docs/TESTING.md](./docs/TESTING.md) – Testing strategy and guidelines
- [docs/RELEASE-CHECKLIST.md](./docs/RELEASE-CHECKLIST.md) – What to verify before shipping or selling

## License

This project is MIT licensed. See [LICENSE](./LICENSE) for full details.

## Legal

- [Privacy Policy](https://vibebuildlab.com/privacy-policy)
- [Terms of Service](https://vibebuildlab.com/terms)

---

> **Vibe Build Lab LLC** · [vibebuildlab.com](https://vibebuildlab.com)
