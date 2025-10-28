# Repository Guidelines

## Project Structure & Module Organization

- `src/app` contains Next.js route groups and API handlers; treat each route as the source of truth for UX flows.
- `src/components` stores shared UI primitives; co-locate story or test files beside components when practical.
- `src/lib` holds domain services, Zustand store logic, utilities, and Prisma client helpers; mirror feature boundaries here.
- `src/types` centralizes cross-module TypeScript definitions.
- `prisma/schema.prisma` defines the data model; seed logic lives in `prisma/seed.ts`.
- `docs/` captures extended guides (auth, testing, deployment); update alongside major changes.

## Build, Test, and Development Commands

- `npm run dev` launches the Next.js dev server with hot reloading.
- `npm run build` performs a production build (Next.js + Prisma checks); use before release branches.
- `npm run start` serves the last production build.
- `npm run lint` runs ESLint (with `eslint-plugin-security`) across the repo.
- `npm run format:check` verifies Prettier/stylelint formatting; pair with `npm run format` for fixes.
- `npm run typecheck` runs `tsc --noEmit` to ensure types stay sound.
- Database tasks: `npm run db:generate`, `npm run db:push`, `npm run db:seed`, and `npm run db:studio`.

## Coding Style & Naming Conventions

- Prettier enforces 2-space indentation, 100 char print width, single quotes, and no semicolons; run `npm run format` before committing.
- Follow ESLint rules from `.eslintrc.json` and `eslint.config.cjs`; prefer functional React components, hooks over classes, and avoid unused exports.
- Name React files with PascalCase (e.g., `Button.tsx`), hooks with `useX` (e.g., `useBilling.ts`), and tests as `<module>.test.ts[x]`.
- Tailwind utilities are available; favor extracting repetitive patterns into `src/components/ui`.

## Testing Guidelines

- Jest with `@testing-library/react` powers unit and integration tests (`*.test.ts[x]` co-located with source).
- Extend `jest.setup.ts` for shared mocks; use `src/lib/test-utils.tsx` helpers for rendering.
- Target ≥80% coverage (`npm run test:coverage`) and ensure happy-path plus failure-mode assertions.
- Use descriptive `describe` blocks mirroring feature names and prefer AAA (arrange–act–assert) formatting.

## Commit & Pull Request Guidelines

- Use Conventional Commits (`feat:`, `fix:`, `docs:`, etc.), matching existing history (e.g., `feat: add billing portal route`).
- Squash local work before opening a PR; ensure branch names follow `type/short-description` (`feature/billing-upgrades`).
- PRs must explain the change, link related issues, summarize tests (`npm run lint`, `npm test`, `npm run typecheck`), and include screenshots/GIFs for UI changes.
- Update relevant docs (`README.md`, `docs/*`, `AGENTS.md`) alongside functionality changes.

## Security & Configuration Tips

- Copy `.env.example` to `.env.local` and rotate credentials before sharing logs; never commit secrets.
- Run `npm run security:audit` and `npm run security:secrets` before release or deployment branches.
- Enable Sentry DSNs locally via `sentry.client.config.ts`/`sentry.server.config.ts` only when needed; guard feature flags in `src/lib`.
