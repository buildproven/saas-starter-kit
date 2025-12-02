# Changelog

All notable changes to the SaaS Starter Kit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Smart Test Strategy for risk-based pre-push validation

### Changed

- Standardized documentation structure

## [1.0.0] - 2025-11-29

### Added

- Initial release
- Next.js 14 App Router with hybrid rendering
- Authentication with NextAuth (JWT strategy)
- Multi-tenant data model (Organizations, Projects, API Keys)
- Stripe billing integration (checkout, portal, webhooks)
- RBAC middleware (USER, ADMIN, SUPER_ADMIN)
- Jest + Testing Library test suite
- ESLint with security plugin
- Husky + lint-staged pre-commit hooks
- GitHub Actions CI/CD

### Tech Stack

- Next.js 14, TypeScript 5+
- PostgreSQL 14+ via Prisma ORM
- Stripe for payments
- Tailwind CSS + shadcn/ui
- Zustand for state management
- Sentry for monitoring
