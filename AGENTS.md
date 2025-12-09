# Repository Guidelines

## Project Structure & Module Organization

- `src/app` Next.js App Router routes and API handlers; `src/components` shared UI primitives; `src/lib` services (auth, billing, subscription, prisma, store); `src/types` shared TypeScript types.
- `prisma/schema.prisma` data models; seeds in `prisma/seed.ts`.
- Tests: unit/integration near sources plus `tests/integration` for cross-cutting cases; Playwright E2E specs in `e2e`; supportive docs in `docs/`.

## Build, Test, and Development Commands

- `npm run dev` start local Next.js server.
- `npm run build` production build (skips DB health/env validation by default).
- `npm run lint` ESLint with security rules; `npm run typecheck` TypeScript only.
- `npm test` Vitest suite; `npm run test:coverage` enforce coverage; `npm run test:e2e` Playwright.
- `npm run db:push` sync Prisma schema; `npm run db:seed` load demo data.
- Pre-push sanity: `npm run quality:check` (type-check + lint + tests) or `npm run validate:pre-push` if available.

## Coding Style & Naming Conventions

- TypeScript-first; prefer functional React components and server components where applicable.
- Formatting handled by Prettier; linting via ESLint (incl. security plugin) and Stylelint for styles. Run `npm run lint:fix` or `npm run format`.
- File naming: components PascalCase (`Button.tsx`), hooks camelCase (`useAuth.ts`), tests mirror subject as `<name>.test.ts[x]`.
- Maintain Tailwind utility ordering and shadcn/ui patterns already present in `src/components/ui`.

## Testing Guidelines

- Framework: Vitest + Testing Library; Playwright for E2E. Coverage threshold set to 80%.
- Place co-located tests next to source; broader flows live under `tests/` or `e2e/`.
- Naming: describe behavior, not implementation; prefer screen queries by role/label. For API routes, cover happy path, validation, and auth branches.
- Run `npm run test:coverage` before PRs; for browser flows, run `npm run test:e2e` (or `npm run test:e2e:ui` during debugging).

## Commit & Pull Request Guidelines

- Follow conventional prefixes seen in history (`feat:`, `fix:`, `chore:`, `docs:`, etc.); keep messages imperative.
- PRs should summarize scope, list key changes, and note testing performed. Link issues and attach screenshots for UI-impacting work.
- Ensure CI green: at minimum `npm run lint`, `npm run typecheck`, and `npm test`; include migration notes when Prisma schema changes.

## Security & Configuration Tips

- Never commit secrets; copy `.env.example` → `.env.local` and fill required values. Database URL is mandatory; Stripe/Sentry optional for local dev.
- Run `npm run security:audit`, `npm run security:secrets`, and `npm run security:config` for hardening.
- For Stripe/Sentry-enabled flows, verify webhooks/DSNs in staging before merge; consult `SECURITY.md` for reporting procedures.
- Before shipping, follow `docs/RELEASE-CHECKLIST.md` (env completeness, lint/type/test/coverage, Playwright smoke). For template sales flows, set Stripe template price IDs, GitHub org/token, and run `npm test -- src/app/api/template-sales/smoke.test.ts`.
