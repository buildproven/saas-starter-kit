# Audit To-Do Status — November 4, 2025

## Completed Since Last Audit

- Added `SKIP_DB_HEALTHCHECK` bypass to keep `npm run build` green in CI environments without Postgres and documented the flag in README/DEPLOYMENT/QUICKSTART.
- Upgraded `next-auth` to `4.24.13` to resolve GHSA-5jpx-9hw9-2fx4 and reran lint, typecheck, tests, and build.
- Implemented Stripe subscription webhook unit tests (`src/app/api/webhooks/subscription/route.test.ts`) covering event creation, dedupe, signature failures, and invoice payment failures.
- Added template fulfillment unit tests (`src/lib/template-sales/fulfillment.test.ts`) to validate email delivery, GitHub access integration, and metadata persistence.
- Captured remaining backlog items and upgrade roadmap in `docs/backlog.md`.
- Collected GitHub usernames during checkout, normalized them through fulfillment, and added SUPER_ADMIN override/retry API (`/api/admin/template-sales/github-access`) with tests and docs.
- Hardened `/template-download` with IP+token rate limiting (5 requests per 15 minutes) and persistent auditing via the `TemplateDownloadAudit` table, plus regression coverage.
- Wired quality and CI workflows to run `npm run template:package`, verify tier archives, and ignored generated artifacts locally.
- Added template-sales smoke test (`src/app/api/template-sales/smoke.test.ts`) exercising checkout → fulfillment → download token redemption with mocked Stripe, email, GitHub, and rate limiting.

## Outstanding Actions

### Medium Priority

1. **Template package artifact management**
   - Upload generated archives as workflow artifacts/releases and define retention policy now that packaging runs in CI.
2. **Download telemetry operations**
   - Define retention/alerting strategy for `TemplateDownloadAudit` and integrate with monitoring tooling.

### Low Priority (Tracked in `docs/backlog.md`)

- Structured logging & analytics for webhook/fulfillment/download funnels.
- Plan phased upgrades for Next.js 16/React 19, Prisma 6, Stripe 19 once compatibility matrix is green.
- Evaluate Lighthouse CI dependency advisories (`@lhci/cli` transitive `cookie/tmp`).

## Next Up (Work Sequence)

1. Finalize template package artifact distribution strategy in CI (upload + retention guidance).
2. Document operational playbook for download auditing (dashboards, alerts, retention).
