# CLAUDE.md - SaaS Starter Kit

This file provides guidance to Claude Code when working with the SaaS Starter Kit.

## Overview

**Product**: SaaS Starter Kit
**Type**: Production-ready SaaS foundation
**Maintainer**: Vibe Build Lab LLC
**Repository**: https://github.com/vibebuildlab/saas-starter-kit

## Pricing (Reference: vibebuildlab/docs/PRICING_STRATEGY.md)

| Package  | Price | Features                               |
| -------- | ----- | -------------------------------------- |
| Hobby    | $99   | Complete template + documentation      |
| Pro      | $249  | + White-label + videos + GitHub access |
| Director | $399  | + 3 months Vibe Lab Pro + consultation |

## Key Commands

```bash
# Development
npm run dev              # Start dev server
npm run lint             # ESLint (with security rules)
npm run typecheck        # TypeScript validation
npm test                 # Jest + Testing Library
npm run test:coverage    # Enforce 80% coverage threshold

# Database
npm run db:push          # Apply Prisma schema
npm run db:seed          # Seed demo data

# Security
npm run security:audit   # npm audit high severity gate
npm run security:check   # All security checks
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5+
- **Database**: PostgreSQL 14+ via Prisma ORM
- **Auth**: NextAuth.js with JWT strategy
- **Payments**: Stripe (checkout, billing portal, webhooks)
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand
- **Testing**: Jest + Testing Library
- **Monitoring**: Sentry
- **CI/CD**: GitHub Actions

## Architecture

- `src/app/` - Next.js App Router pages and API routes
- `src/components/` - React components (shadcn/ui based)
- `src/lib/` - Shared utilities (auth, billing, db)
- `prisma/` - Database schema and migrations

## RBAC Roles

- `USER` - Default authenticated user
- `ADMIN` - Organization administrator
- `SUPER_ADMIN` - System administrator

## When Editing

1. Run tests before committing: `npm test`
2. Ensure TypeScript passes: `npm run typecheck`
3. Check security: `npm run security:audit`
4. Use Conventional Commits for messages

## Legal References

- Privacy: https://vibebuildlab.com/privacy-policy
- Terms: https://vibebuildlab.com/terms
