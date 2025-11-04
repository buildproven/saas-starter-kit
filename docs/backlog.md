# Technical Backlog & Recommendations

## Dependency Upgrade Plan

1. **Short term (patch/minor)**
   - Update TypeScript to 5.9.x and align `@types/*`, `@typescript-eslint/*`, `jest` 29.x patches.
   - Upgrade `next-auth` already handled; monitor Resend SDK versions.
2. **Mid term (within 1–2 sprints)**
   - Bump Jest/Testing Library to latest majors (30.x / 16.x) with snapshot updates.
   - Move ESLint toolchain to 9.x + flat config conversions.
3. **Long term (scheduled release)**
   - Migrate Next.js/React to 16/19 once Prisma 6 + Stripe 19 compatibility verified.
   - Document breaking changes and QA checklist per tier.

## GitHub Access Improvements

- Collect GitHub username during template checkout (additional form field) and persist alongside sale metadata.
- Add admin override UI/API for support to map/unmap GitHub identities.
- Implement retry/backoff in `grantGitHubAccess` and surface failures via logging/alerts.

## Template Download Hardening

- Ensure retention/aggregation strategy for new `TemplateDownloadAudit` table (dashboards, anomaly alerts).
- Evaluate moving in-memory rate limiting to Redis/Upstash when scaling beyond single instance.

## Monitoring & Analytics

- Emit structured logs to Sentry/Datadog for:
  - Webhook successes/failures and retry counts.
  - Template fulfillment lifecycle (email delivery, GitHub invitation).
  - Download activity + throttling decisions.
- Add funnel metrics (checkout -> fulfillment -> download) for template-sales conversions.

## CI Enhancements

- Upload packaged template archives as workflow artifacts or release assets for downstream checks now that CI verifies `npm run template:package`.
- Cache build artifacts (`.next/cache`, `node_modules/.cache`) across jobs.
- Document the need for `SKIP_DB_HEALTHCHECK=false` in environments with reachable Postgres.

## Additional Tasks

- Document how to run the template-sales smoke test locally (env setup, commands) and promote to staging end-to-end checklist when real Stripe/Resend credentials are available.
- Create backlog ticket for download endpoint integration tests once rate limiting is in place.
