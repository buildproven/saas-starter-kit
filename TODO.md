# To-Do List

Status legend:
- ⭕️ Planned / not started
- 🚧 In progress
- ✅ Completed

## Immediate (Sprint 0–1)
- ⭕️ Wire Stripe SDK into `BillingService` and remove mock implementations.
- ⭕️ Implement `/api/webhooks/stripe` handler with signature validation and subscription sync.
- ⭕️ Store Stripe product/price IDs on `Plan` records and align seed data.
- ⭕️ Build billing portal UI in dashboard (plan summary, invoices, cancellation).
- ⭕️ Surface upgrade prompts when `SubscriptionService.checkLimits()` reports violations.
- ⭕️ Add invitation + membership management endpoints (`/api/organizations/members`).
- ⭕️ Configure GitHub Actions to run `npm run lint`, `npm run typecheck`, `npm test` on pull requests (quality.yml already exists; ensure it’s enabled).
- ⭕️ Define GitHub issue templates, labels, and project board (tracking this roadmap).

## Near-Term (Phase 1–2)
- ⭕️ Create `/admin` dashboard for SUPER_ADMIN operations (user/org search, plan overrides).
- ⭕️ Expand audit logging for key events (sign-in, API key creation, billing actions).
- ⭕️ Implement email verification flow (SendGrid integration, transactional templates).
- ⭕️ Add 2FA scaffolding (backup codes, OTP) for high-security tenants.
- ⭕️ Build usage analytics widgets (charts for API calls, storage, seats) using `UsageRecord`.
- ⭕️ Deliver CSV export endpoints for usage and billing.
- ⭕️ Instrument logging + metrics (structured logs, Sentry performance, optional Datadog).
- ⭕️ Introduce feature flag system and admin UI for toggles.

## Long-Term (Phase 3+)
- ⭕️ Generate OpenAPI spec / TS SDK for the public API.
- ⭕️ Publish developer documentation (guides, Postman collection).
- ⭕️ Offer additional OAuth providers (Microsoft, Slack, Okta).
- ⭕️ Build new marketing site + MDX content system.
- ⭕️ Add in-app onboarding checklist and contextual tips.
- ⭕️ Implement Redis or edge caching for high-traffic endpoints.
- ⭕️ Set up load tests and alerting thresholds (Latency, RPS drop, error spikes).
- ⭕️ Internationalize UI (i18n) and prep for multi-region deployments.

## Nice-to-Haves / Backlog
- ⭕️ Automated revenue reporting dashboards (MRR, churn, cohort charts).
- ⭕️ Customer self-serve data export and delete (GDPR tooling).
- ⭕️ SLA monitoring & status page integration.
- ⭕️ CLI tool for tenant provisioning and support operations.
- ⭕️ Integration templates (Zapier app, Slack bot, GitHub Marketplace listing).
