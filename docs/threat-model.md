# Threat Model (High-Level)

Scope: public marketing pages, NextAuth-based authentication, Stripe webhook processing, template purchase/download flows, API key management.

Primary assets
- User accounts & sessions (NextAuth, Prisma)
- Billing events & Stripe webhooks
- Template download links, license keys, API keys
- Organization data and membership state

Key entry points & mitigations
- Authentication & session: NextAuth with email/password and providers; env validation enforces secrets; rate limiting in `src/lib/rate-limit`; protected routes in `src/components/auth/ProtectedRoute`.
- Webhooks: Stripe signature verification with replay protection; duplicate detection logging; tests cover happy-path/duplicate/invalid signature cases.
- File/template delivery: download token checked and audited (`TemplateDownloadAudit`); path traversal test present; API key scopes enforced.
- APIs: Zod validation on env; use of Prisma for ORM to avoid SQLi; input validation in API routes; CSRF not applicable to stateless APIs; RBAC via organization role.

Abuse & availability
- Rate limit utilities in place; add per-IP and per-user limits on auth and download endpoints at edge if traffic grows.
- Logging/monitoring: Pino logger configured; recommend shipping to APM and alerting on webhook failures and 4xx/5xx spikes.

Residual risks / next steps
- Add CSP/secure headers in middleware for marketing/app routes.
- Add automated secret scanning in CI (gitleaks or npm run security:secrets).
- Add periodic security audit step in CI (npm audit) and dependency bot.
- Add SLOs and alerts for webhook success rate and template download latency.
