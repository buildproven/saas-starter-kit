# SaaS Starter Kit - Claude Guide

> Production-ready SaaS foundation with multi-tenant architecture, Stripe billing, and Supabase auth.

## Tech Stack

| Layer     | Technology                         |
| --------- | ---------------------------------- |
| Framework | Next.js 16 (App Router)            |
| Language  | TypeScript 5 (strict)              |
| Database  | PostgreSQL (Neon) + Prisma 6       |
| Auth      | Supabase (GitHub/Google/email)     |
| Payments  | Stripe (subscriptions + templates) |
| UI        | shadcn/ui, Tailwind v4             |
| Testing   | Vitest 4 + Playwright              |

## Key Commands

```bash
npm run dev              # Dev server
npm run build            # Production build
npm run db:push          # Apply schema
npm run db:studio        # Prisma GUI
npm test                 # Vitest (80% coverage)
npm run test:e2e         # Playwright
npm run quality:ci       # Full CI pipeline
```

## Project Structure

```text
src/
├── app/
│   ├── dashboard/       # Protected routes
│   └── api/            # Route handlers
├── lib/
│   ├── supabase/       # Auth client/server
│   ├── auth/           # get-user helpers
│   ├── billing/        # Stripe logic
│   └── edge-rate-limit.ts
└── components/         # shadcn/ui
prisma/                 # Database schema
```

## Auth Pattern

```typescript
import { getUser, requireUser } from '@/lib/auth/get-user'

// API Route
const user = await getUser()
if (!user) return 401

// ALWAYS filter by user/org ID
const projects = await prisma.project.findMany({
  where: { organization: { members: { some: { userId: user.id } } } },
})
```

## Database Models

- **Users**: User, Organization, OrganizationMember
- **Billing**: Subscription, Plan, ApiKey
- **Projects**: Project
- **Templates**: TemplateSale, TemplateDownloadAudit

## What NOT to Do

- Don't skip auth checks
- Don't use `any` types
- Don't query DB without userId/orgId filter
- Don't skip rate limiting on public endpoints
- Don't use `dangerouslySetInnerHTML` or `eval()`

---

## Agent Workflow

### Session Start

Load codebase context before exploring:

```text
Read docs/dev_guide/CONVENTIONS.md
```

### Planning Complex Work

Before implementing anything spanning multiple files:

```text
/bs:plan <feature-name>
```

### Session Handoff

```text
/bs:context --save   # before ending session
/bs:context --resume # at start of new session
```

---

_80% test coverage. See `docs/` for details. Global rules in `~/.claude/CLAUDE.md`._
