# Dev Guide — SaaS Starter Kit

> Load this at session start. Replaces blind codebase exploration.

**Last updated:** 2026-03-08

## What This Project Does

Production-ready multi-tenant SaaS foundation built on Next.js 16 (App Router), Prisma + PostgreSQL, and Supabase Auth. Entry point: `src/app/` for routes, `src/middleware.ts` for RBAC enforcement. Ships with Stripe billing, shadcn/ui, Vitest, and Playwright.

## Directory Structure

```text
saas-starter-kit/
├── src/
│   ├── app/             # Next.js App Router routes + API handlers
│   │   ├── dashboard/   # Protected routes (auth-gated)
│   │   └── api/         # Route handlers
│   ├── components/      # shadcn/ui primitives and shared UI
│   ├── hooks/           # Custom React hooks (camelCase)
│   ├── lib/             # Core services
│   │   ├── supabase/    # Auth client + server helpers
│   │   ├── auth/        # get-user, requireUser helpers
│   │   ├── billing/     # Stripe checkout, billing portal, webhooks
│   │   └── edge-rate-limit.ts
│   ├── middleware.ts     # Auth + RBAC enforcement (runs on every request)
│   └── types/           # Shared TypeScript types
├── prisma/
│   ├── schema.prisma    # Database schema (PostgreSQL)
│   └── seed.ts          # Demo data seeder
├── tests/               # Integration + cross-cutting test specs
├── e2e/                 # Playwright end-to-end specs
├── docs/                # Architecture, deployment, testing guides
│   ├── dev_guide/       # Agent-ready session docs (this file)
│   └── plans/           # Feature planning docs
├── scripts/             # Automation scripts
└── .env.example         # Required env var reference
```

## Key Files

| File                        | Role                                                           |
| --------------------------- | -------------------------------------------------------------- |
| `src/middleware.ts`         | Auth + RBAC — runs on every request, enforces roles            |
| `src/lib/auth/get-user.ts`  | `getUser()` / `requireUser()` — use in every protected handler |
| `src/lib/billing/`          | Stripe checkout, billing portal, subscription helpers          |
| `src/lib/supabase/`         | Auth client (browser) + server (RSC/API)                       |
| `prisma/schema.prisma`      | Source of truth for DB models                                  |
| `CLAUDE.md`                 | Project-specific Claude Code rules                             |
| `AGENTS.md`                 | Repo guidelines for AI agents                                  |
| `docs/ARCHITECTURE.md`      | Module boundaries, data flow, extension points                 |
| `docs/TESTING.md`           | Testing strategy and guidelines                                |
| `docs/RELEASE-CHECKLIST.md` | Pre-release verification steps                                 |

## Conventions

### Auth — always use helpers, never roll your own

```typescript
import { getUser, requireUser } from '@/lib/auth/get-user'

// In API routes
const user = await getUser()
if (!user) return new Response('Unauthorized', { status: 401 })

// Always filter queries by user/org ID — never omit the where clause
const projects = await prisma.project.findMany({
  where: { organization: { members: { some: { userId: user.id } } } },
})
```

### Naming

- Components: `PascalCase.tsx` (e.g. `UserCard.tsx`)
- Hooks: `camelCase.ts` (e.g. `useAuth.ts`)
- Tests: mirror source as `<name>.test.ts[x]`
- API routes: Next.js App Router conventions (`route.ts` in `app/api/`)

### Code Style

- TypeScript strict mode — no `any`, no `@ts-ignore`
- Prettier + ESLint (security plugin) — run `npm run lint:fix` to auto-fix
- Tailwind utility ordering consistent with existing components
- shadcn/ui patterns for UI components — extend, don't replace

### Adding a Feature

1. Add/update Prisma models in `prisma/schema.prisma`, then `npm run db:push`
2. Add server logic in `src/lib/` (services) or `src/app/api/` (route handlers)
3. Add auth + org/user scoping to every DB query
4. Add/update tests (unit in `tests/`, E2E in `e2e/`)
5. Update `docs/` if the feature changes architecture or deployment

## Running the Project

```bash
# Install
npm install

# Configure environment
cp .env.example .env.local
# Fill in: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# Optional: STRIPE_SECRET_KEY, SENTRY_DSN, UPSTASH_REDIS_REST_URL

# Database
npm run db:push        # Apply schema
npm run db:seed        # Seed demo data (optional)

# Dev server
npm run dev            # http://localhost:3000

# Test
npm test               # Vitest unit/integration (80% coverage threshold)
npm run test:coverage  # With coverage report
npm run test:e2e       # Playwright smoke tests

# Lint + typecheck
npm run lint
npm run typecheck
npm run quality:check  # All three combined
```

## Agent Gotchas

- **Required env vars**: `DATABASE_URL` and Supabase vars are mandatory. Stripe/Sentry are optional locally but required for billing/monitoring flows.
- **Rate limiting**: Upstash Redis in prod; falls back to in-memory in dev/tests. Don't skip rate limiting on public endpoints.
- **DB queries must always scope by userId/orgId** — the middleware enforces roles but does not scope data — you must do it in every query.
- **No `any` types** — TypeScript strict mode is enforced via lint-staged and CI.
- **Pre-push hook runs**: typecheck + lint + tests via `npm run validate:pre-push`. Don't bypass with `--no-verify`.
- **Build skips env validation** — `SKIP_ENV_VALIDATION=true` is set in the build script intentionally for CI. Local dev validates normally.
- **Roles**: `USER`, `ADMIN`, `SUPER_ADMIN` — enforced in middleware and expected in DB queries.

## Active Development Areas

From recent git log:

- Dependency updates (Dependabot PRs: Next.js, Prisma, rollup, ajv, qs)
- Prisma v7 migration (completed: `fef9c43`)
- Supabase auth + Tailwind v4 migration (completed: `5459991`)
- TypeScript strictness improvements (no-any cleanup: `f7406f0`)
- Rebrand from VibeBuildLab to BuildProven (`c8a747a`)
- CI: GitHub release automation, Dependabot auto-merge, weekly audit workflows
