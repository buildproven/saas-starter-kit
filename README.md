# SaaS Starter Template

A batteries-included SaaS foundation built with Next.js 14 (App Router), Prisma, and Stripe-ready billing flows. Use it to launch multi-tenant products with authentication, RBAC, subscriptions, and modern DX defaults already wired together.

## Highlights

- **Next.js App Router** with hybrid rendering, server actions, and middleware-driven RBAC.
- **Authentication & Authorization** using NextAuth (JWT strategy), Prisma adapter, and role-aware middleware (`USER`, `ADMIN`, `SUPER_ADMIN`).
- **Multi-tenant data model** with Organizations, Projects, API Keys, Plans, and Usage tracking powered by Prisma & PostgreSQL.
- **Billing scaffolding** with Stripe-compatible helpers (checkout, billing portal, subscription enforcement).
- **Production tooling**: Jest + Testing Library, ESLint (security plugin), Prettier, Tailwind (shadcn/ui tokens), Sentry, Husky + lint-staged, and GitHub Actions.
- **State management & UI**: Zustand global store, shadcn-style component primitives, and Lucide iconography.

## Prerequisites

- Node.js ≥ 20 (Volta and `.nvmrc` are provided).
- PostgreSQL 14+ (local or managed). SQLite is not supported.
- npm ≥ 10 (installed automatically via Volta if desired).
- Stripe + Sentry credentials when enabling billing or production monitoring (optional in local dev).

## Quick Start

1. **Clone & Install**

   ```bash
   git clone https://github.com/yourusername/saas-starter-template.git
   cd saas-starter-template
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   # Fill in database, NextAuth, Stripe, and Sentry values
   ```

3. **Database bootstrap**

   ```bash
   npm run db:push        # Apply Prisma schema
   npm run db:seed        # (Optional) Seed plans & demo data
   ```

4. **Run the app**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000` and sign in with any configured OAuth provider (Google/GitHub by default).

## Environment Cheat Sheet

`DATABASE_URL` is required for Prisma. The following groups should be populated before deploying:

- **NextAuth** – `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, provider IDs/secrets.
- **Stripe** – `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` identifiers for each active plan.
- **Template sales (optional)** – `STRIPE_TEMPLATE_*` price IDs, `TEMPLATE_FULFILLMENT_SECRET`, `TEMPLATE_FILES_PATH` (points to packaged assets).
- **Sentry (optional)** – `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
- **App metadata** – `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_APP_URL`.
- **Emails (optional)** – `SENDGRID_API_KEY` or `RESEND_API_KEY`, plus `FROM_EMAIL`.

Refer to `.env.example` for the full list and descriptions.

## Project Layout

```
├── prisma/                 # Prisma schema, seeds, migrations
├── src/
│   ├── app/                # Next.js App Router routes & API endpoints
│   │   ├── api/            # REST endpoints (organizations, billing, etc.)
│   │   ├── auth/           # Auth pages (signin, signout, error)
│   │   └── dashboard/      # Example authenticated UI
│   ├── components/         # UI primitives (shadcn-derived) & feature widgets
│   ├── lib/                # Services: auth, billing, subscription, Zustand store
│   └── styles/             # Tailwind globals and tokens
├── docs/                   # Additional product documentation (optional)
├── API.md                  # Endpoint reference
├── ARCHITECTURE.md         # System design & module overview
├── DEPLOYMENT.md           # Production deployment playbook
└── CONTRIBUTING.md         # Developer workflow guidelines
```

## Development Workflow

| Command                                   | Purpose                                           |
| ----------------------------------------- | ------------------------------------------------- |
| `npm run dev`                             | Start the Next.js dev server with hot reload      |
| `npm run lint`                            | ESLint (including security and React hooks rules) |
| `npm run typecheck`                       | TypeScript project validation (`tsc --noEmit`)    |
| `npm test` / `npm run test:watch`         | Jest + Testing Library (JS DOM environment)       |
| `npm run test:coverage`                   | Enforce 80% global coverage threshold             |
| `npm run format` / `npm run format:check` | Prettier and Stylelint                            |
| `npm run db:push` / `npm run db:generate` | Prisma schema application & client generation     |
| `npm run db:seed`                         | Populate core Plan data and sample content        |
| `npm run security:audit`                  | `npm audit` high severity gate                    |
| `npm run security:secrets`                | Detect hardcoded secrets in repository            |

Husky hooks run lint-staged tasks on staged files; ensure you install dependencies before committing.

> **Note:** In restricted environments (CI or read-only worktrees) run `HUSKY=0 npm install` to skip Husky’s `prepare` hook when it cannot update `.git/config`.

## Optional: Selling the Template

The repo includes APIs for monetising the starter itself. To enable them:

1. Configure Stripe template products/prices (`STRIPE_TEMPLATE_*`).
2. Set `TEMPLATE_FULFILLMENT_SECRET` and point `TEMPLATE_FILES_PATH` to the packaged assets.
3. Wire an email provider in `src/lib/email/template-delivery.ts` (the default logs a warning instead of sending).
4. Provide a GitHub access token if you want automated repo access for Pro/Enterprise buyers and collect GitHub usernames during checkout (the purchase form includes an optional field).
5. Support staff can retry or override invitations via the `/api/admin/template-sales/github-access` endpoint (SUPER_ADMIN only).
6. Download tokens are rate limited (5 requests per 15 minutes per IP/token) and every attempt is logged to `TemplateDownloadAudit` for auditing.

Without these values the template-sales endpoints return informative errors and skip fulfillment.

Once configured, package the deliverables with `npm run template:package` to populate the tiered archives under `TEMPLATE_FILES_PATH`.

## Testing & Quality Gates

- Unit/integration tests live alongside source files (`*.test.ts[x]`) and under `src/lib`.
- `jest.setup.ts` configures the JS DOM environment, mocks Next navigation, and polyfills web streams.
- Coverage target: 80% branches/functions/lines/statements (enforced in `jest.config.js`).
- ESLint includes `eslint-plugin-security` to surface common security pitfalls.
- Stylelint enforces consistency for Tailwind and utility CSS.

Run the full suite before opening a PR:

```bash
npm run lint
npm run typecheck
npm test

# Optional: run template-sales smoke test
npm test -- --runInBand src/app/api/template-sales/smoke.test.ts
```

## Documentation

- [API.md](./API.md) – HTTP endpoints and authentication expectations.
- [ARCHITECTURE.md](./ARCHITECTURE.md) – Module boundaries, data flow, and extension points.
- [DEPLOYMENT.md](./DEPLOYMENT.md) – How to promote the stack to production/Vercel.
- [CONTRIBUTING.md](./CONTRIBUTING.md) – Coding standards, branch strategy, and PR checklist.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step instructions on deploying to Vercel (or another Node-friendly platform), configuring environment variables, seeding databases, enabling Sentry, and wiring Stripe webhooks.

## 💰 Commercial Template Sales

This open-source template is free to use under MIT license. We also offer **premium packages** with advanced features:

| Package        | Price  | Features                                                       |
| -------------- | ------ | -------------------------------------------------------------- |
| **Basic**      | $299   | Complete template + docs + email support                       |
| **Pro**        | $599   | Basic + white-label + videos + GitHub access + consultation    |
| **Enterprise** | $1,499 | Pro + deployment + training + extended support + customization |

**[🚀 Purchase Premium Packages](https://your-domain.com/template-purchase)**

## License

**Dual Licensed:**

- **Open Source**: MIT License (see [LICENSE](./LICENSE)) - Free for personal and commercial use
- **Commercial**: Premium packages include additional rights and restrictions (see [COMMERCIAL_LICENSE.md](./COMMERCIAL_LICENSE.md))

The open-source version is free to use for any purpose. Premium packages provide enhanced features, support, and commercial protections.

## Support & Feedback

Issues and pull requests are encouraged. If you launch something with the template, let us know!
