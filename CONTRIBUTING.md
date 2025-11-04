# Contributing Guide

Thank you for helping improve the SaaS Starter Template! This document describes the expectations, workflows, and quality bars for maintainers and contributors.

## Prerequisites

- Node.js ≥ 20 (Volta and `.nvmrc` are included for consistency).
- PostgreSQL 14+ (local DB for development).
- npm ≥ 10.
- Stripe & Sentry credentials (optional, only required for billing/observability work).

Install dependencies once you clone the repository:

```bash
npm install
```

## Branching Strategy

- Create feature branches from `master`:  
  `git checkout -b feature/my-awesome-change`
- Use concise, hyphenated names (`feature/rbac-fixes`, `fix/billing-webhook`).
- Sync with upstream regularly (`git fetch origin && git rebase origin/master`).

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) so changelogs can be generated automatically.

```
feat: add project usage charts
fix: correct subscription limit comparison
docs: update deployment instructions for Neon
refactor: move billing service to shared module
```

Keep commits focused—separate refactors from feature work when practical.

## Development Workflow

1. **Start the dev server**
   ```bash
   npm run dev
   ```
2. **Apply Prisma changes**
   ```bash
   npm run db:push
   npm run db:seed   # optional demo data
   ```
3. **Run quality gates continually**
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```
4. **Format before committing** (Husky runs `lint-staged`, but you can format manually):
   ```bash
   npm run format
   ```

## Database Changes

- Update `prisma/schema.prisma`, then run `npm run db:generate` and `npm run db:push`.
- Seed data goes in `prisma/seed.ts`; ensure seeds are idempotent.
- Include migration notes in your PR description if data backfills or manual scripts are required.

## Testing Expectations

- Add or update tests alongside new code (`*.test.ts[x]`), keeping coverage ≥ 80%.
- Use mocks from `src/lib/test-utils.tsx` for React components and hooks.
- For API routes, prefer calling exported handlers directly with mocked `NextRequest`.
- If behavior cannot be easily unit-tested, describe manual testing steps in the PR.

## Linting & Formatting

- ESLint (with security rules) covers `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.html`.
- Stylelint targets Tailwind/CSS modules.
- Prettier formats everything else.
- Husky + lint-staged enforce these on staged files—ensure hooks remain enabled (`npm run prepare` runs automatically after install).

## Pull Request Checklist

Before requesting review:

- [ ] Rebased on `master`, no merge commits.
- [ ] Tests, lint, and typecheck pass locally.
- [ ] Added/updated documentation (`README.md`, `API.md`, etc.) if behavior changes.
- [ ] Included screenshots/GIFs for meaningful UI changes.
- [ ] Added migration instructions (if schema changes).
- [ ] Linked related issues and described the solution succinctly.

## Code Review Expectations

- Address feedback promptly; respond with context if you disagree.
- Squash or tidy commits as needed—final history should be clean and descriptive.
- Resolving review comments is the author's responsibility.

## Release Process

The maintainer team tags releases (`v1.x.y`) after merging to `master`. Keep PR titles meaningful to simplify release notes.

## Questions & Support

Open a GitHub issue or start a discussion if anything in this guide is unclear. Happy building!
