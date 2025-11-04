# Architecture Overview

This document describes the major components, data flows, and extension points for the SaaS Starter Template. The goal is to provide a mental model that helps contributors reason about the system and make safe changes.

## High-Level Stack

- **Framework**: Next.js 14 App Router with TypeScript.
- **Authentication**: NextAuth (JWT strategy) with Prisma adapter.
- **Database**: PostgreSQL accessed through Prisma ORM.
- **State Management**: Zustand for client-side session and UI state sync.
- **UI Layer**: Tailwind CSS + shadcn/ui-inspired component primitives and Lucide icons.
- **Observability**: Sentry client/server SDKs, structured error logging helpers.
- **Tooling**: Jest, Testing Library, ESLint (incl. security plugin), Stylelint, Prettier, Husky & lint-staged.

```
┌─────────────┐
│  Browser    │
│ (Next.js UI)│
└────┬────────┘
     │
     │ Zustand cache, NextAuth client
     ▼
┌─────────────┐        Prisma Client        ┌──────────────┐
│ Next.js App │  ─────────────────────────▶ │  PostgreSQL  │
│  Routes     │        (server actions)     └──────────────┘
│  API routes │                              ▲
└────┬────────┘                              │
     │                                        │
     │ BillingService / SubscriptionService   │
     └───────────── third-party providers ────┘
```

## Core Modules

### Authentication & Authorization
- `src/lib/auth.ts` defines `authOptions` with Prisma adapter, Google/GitHub providers, and JWT callbacks that embed `user.id` and `user.role`.
- JWT sessions are required so middleware (`src/middleware.ts`) can read `req.nextauth.token.role`.
- `src/lib/auth/api-protection.ts` exports helpers (`withAuth`, `withAdminAuth`, `withSuperAdminAuth`) that enforce role hierarchy in API handlers while injecting the `AuthenticatedUser`.
- UI-level protection uses `ProtectedRoute`, `RoleGate`, and `useAuth()` to guard routes and components.

### Routing & Middleware
- App Router structure:
  - `src/app/page.tsx` – landing experience.
  - `src/app/auth/*` – sign-in/out/error flows.
  - `src/app/dashboard` + `src/app/profile` – authenticated dashboards built with shadcn components.
  - `src/app/api/*` – REST endpoints grouped by domain (organizations, projects, billing, etc.).
- `src/middleware.ts` inspects the pathname, identifies required access (public, authenticated, admin, super-admin), and redirects unauthenticated users to `/auth/signin` or `/unauthorized`.

### Data Access
- The Prisma schema (`prisma/schema.prisma`) models:
  - **User** (with role), `Account` & `Session` (NextAuth), `VerificationToken`
  - **Organization**, `OrganizationMember`, and related `Project`, `ApiKey`, `Subscription`, `Plan`, `UsageRecord`
- `src/lib/prisma.ts` exports a singleton Prisma client.
- `src/lib/db-utils.ts` wraps common operations (organization creation, subscription management, usage tracking, API key helpers). These are used inside API routes and can be reused in server actions.

### Subscription & Billing
- `src/lib/subscription.ts` contains the `SubscriptionService` which:
  - Computes plan features (`PLAN_CONFIGS` defaults) and usage limits.
  - Evaluates whether an organization can perform an action (`canPerformAction`).
  - Tracks usage metrics via the `UsageRecord` table.
  - Handles subscription CRUD (create/update/cancel/reactivate).
- `src/lib/billing.ts` is a Stripe-ready abstraction with mocked behavior. Replace methods with Stripe SDK calls for production usage. Endpoints under `src/app/api/billing/*` delegate to this service.

### State Management
- `src/lib/store.ts` defines a persisted Zustand store for session-aware UI data (user, organizations, API keys, notifications, theme).
- Hooks in `src/lib/hooks/useStore.ts` expose composable selectors (`useSessionSync`, `useCurrentOrganization`, `useNotifications`, etc.).
- Auth-specific hooks (`src/lib/hooks/useAuth.ts`) derive role checks and convenience methods for RBAC-enabled UI.

### UI & Styling
- Tailwind is configured in `tailwind.config.ts` with shadcn tokens (`background`, `card`, `muted`, etc.) and CSS variables defined in `src/app/globals.css`.
- UI primitives live in `src/components/ui/*` (Button, Card, Tabs, Switch, Avatar, Skeleton, etc.) and follow Radix/Slot patterns for flexibility.
- Feature components (auth flows, error boundary, providers) sit under `src/components/auth`, `src/components/error`, `src/components/providers`.

### Error Handling & Instrumentation
- `src/lib/error-logging.ts` wraps Sentry logging with error categorization and helper functions (`authError`, `validationError`, etc.).
- Global error boundaries:
  - `src/app/global-error.tsx` handles uncaught App Router errors and reports to Sentry.
  - `src/components/error/ErrorBoundary.tsx` covers client component failures.

### Testing
- Jest configuration (`jest.config.js`) integrates with Next.js via `next/jest`.
- `jest.setup.ts` polyfills browser APIs, mocks Next navigation, and sets up custom `Request`/`Response` classes for route testing.
- Example tests:
  - `src/components/ui/Button.test.tsx`
  - `src/app/page.test.tsx`
  - `src/lib/store.test.ts` + `src/lib/notification-autodismiss.test.ts`
  - `src/app/api/hello/route.test.ts`
  - `src/lib/hooks/__tests__/useAuth.test.ts`
- Coverage threshold is set to 80% globally. Add targeted tests when extending domains.

## Request Flow

1. **Client navigation** (e.g., `/dashboard`) hits the App Router route. `ProtectedRoute` ensures the user has the required role; RBAC decisions use `useAuth()` + Zustand state.
2. **Data fetching** happens via server components or client-side requests to `/api/*` endpoints.
3. **Middleware** runs before both page and API requests, validating the session token and role.
4. **API handler** uses `getServerSession(authOptions)` or helper decorators to access the authenticated user, performs zod validation, and interacts with Prisma.
5. **SubscriptionService/BillingService** enforce plan limits and orchestrate Stripe flows.
6. **Responses** return JSON payloads with appropriate status codes. Errors flow through helper loggers and Sentry.

## Extending the Template

- **Add a new domain**: create a Prisma model, run `npm run db:generate`, add API routes under `src/app/api/<domain>/route.ts`, and add UI screens under `src/app/<section>/`.
- **Integrate external services**: wrap SDK calls in `/src/lib/<service>.ts` and expose them via API routes or server actions. Follow the error logging conventions.
- **Enhance billing**: replace the mock `BillingService` implementations with real Stripe (or alternative) calls and secure webhook validation under `src/app/api/webhooks`.
- **Frontend features**: build on top of shadcn primitives (`src/components/ui`) and use Zustand hooks for global state (e.g., notifications, theme, organization context).

## Data Model Snapshot

Key relationships (simplified):
- `User` ↔ `Organization` (owns organizations and joins via `OrganizationMember`)
- `Organization` ↔ `Project`, `ApiKey`, `Subscription`
- `Subscription` ↔ `Plan`
- `UsageRecord` tracks metered usage for `Project` or `ApiKey`

See `prisma/schema.prisma` for the complete schema including enums (`UserRole`, `OrganizationRole`, `SubscriptionStatus`, etc.).

## Deployment Considerations

- Ensure environment variables in `.env.example` are set in production (see `DEPLOYMENT.md`).
- Migrations are applied via `npm run db:push` or `prisma migrate`.
- Configure Stripe webhooks and Sentry DSNs before enabling billing/monitoring features.
- GitHub Actions workflow (`.github/workflows/quality.yml`) runs lint/test/typecheck automatically; expand with deployment jobs as needed.

## References

- [API.md](./API.md) – Endpoint specifics.
- [DEPLOYMENT.md](./DEPLOYMENT.md) – Production readiness checklist.
- [CONTRIBUTING.md](./CONTRIBUTING.md) – Development workflow standards.
