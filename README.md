# SaaS Starter Kit

A batteries-included SaaS foundation built with Next.js 14 (App Router), Prisma, and Stripe-ready billing flows. Launch multi-tenant products with authentication, RBAC, subscriptions, and modern DX defaults already wired together.

---

> **Maintainer & Ownership**
> This project is maintained by **Vibe Build Lab LLC**, a studio focused on AI-assisted product development, micro-SaaS, and "vibe coding" workflows for solo founders and small teams.
> Learn more at **https://www.vibebuildlab.com**.

---

## Features

- **Next.js App Router** with hybrid rendering, server actions, and middleware-driven RBAC
- **Authentication & Authorization** using NextAuth (JWT strategy), Prisma adapter, and role-aware middleware (`USER`, `ADMIN`, `SUPER_ADMIN`)
- **Multi-tenant data model** with Organizations, Projects, API Keys, Plans, and Usage tracking powered by Prisma & PostgreSQL
- **Billing scaffolding** with Stripe-compatible helpers (checkout, billing portal, subscription enforcement)
- **Production tooling**: Jest + Testing Library, ESLint (security plugin), Prettier, Tailwind (shadcn/ui tokens), Sentry, Husky + lint-staged, and GitHub Actions
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
| **Framework**  | Next.js 14 (App Router)                     |
| **Language**   | TypeScript 5+                               |
| **Database**   | PostgreSQL 14+ via Prisma ORM               |
| **Auth**       | NextAuth.js with JWT strategy               |
| **Payments**   | Stripe (checkout, billing portal, webhooks) |
| **Styling**    | Tailwind CSS + shadcn/ui                    |
| **State**      | Zustand                                     |
| **Testing**    | Jest + Testing Library                      |
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
# Fill in database, NextAuth, Stripe, and Sentry values

# Database setup
npm run db:push        # Apply Prisma schema
npm run db:seed        # (Optional) Seed plans & demo data

# Start development
npm run dev
```

Visit `http://localhost:3000` and sign in with any configured OAuth provider.

### Environment Variables

Key environment groups to configure:

- **NextAuth** – `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, provider IDs/secrets
- **Database** – `DATABASE_URL` (required)
- **Stripe** – `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Sentry** – `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- **Rate limiting (prod required)** – `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (falls back to memory in dev/tests only)

Refer to `.env.example` for the full list.

### Development Commands

| Command                  | Purpose                           |
| ------------------------ | --------------------------------- |
| `npm run dev`            | Start dev server with hot reload  |
| `npm run lint`           | ESLint (including security rules) |
| `npm run typecheck`      | TypeScript validation             |
| `npm test`               | Jest + Testing Library            |
| `npm run test:coverage`  | Enforce 80% coverage threshold    |
| `npm run db:push`        | Apply Prisma schema               |
| `npm run db:seed`        | Seed demo data                    |
| `npm run security:audit` | npm audit high severity gate      |

## Usage Examples

### Protecting an API Route

```typescript
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }
  // Your protected logic here
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

- [x] Core authentication with NextAuth
- [x] Multi-tenant data model
- [x] Stripe billing integration
- [x] Smart test strategy
- [ ] Team collaboration features
- [ ] Advanced analytics dashboard
- [ ] Email notification system
- [ ] Webhook management UI

## Documentation

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) – Module boundaries, data flow, and extension points
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) – Production deployment playbook
- [docs/TESTING.md](./docs/TESTING.md) – Testing strategy and guidelines

## License

This project is MIT licensed. See [LICENSE](./LICENSE) for full details.

## Legal

- [Privacy Policy](https://vibebuildlab.com/privacy-policy)
- [Terms of Service](https://vibebuildlab.com/terms)

---

> **Vibe Build Lab LLC** · [vibebuildlab.com](https://vibebuildlab.com)
