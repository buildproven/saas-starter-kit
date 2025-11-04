# Product Roadmap

A high-level plan for evolving the SaaS Starter Template from internal alpha to production-ready platform. Timelines assume a small team (2–3 engineers) working in two-week sprints; adjust to match your cadence.

---

## Phase 0 – Stabilize & Document (Week 0)
- ✅ Harden core docs (`README`, `ARCHITECTURE`, `API`, `DEPLOYMENT`, `CONTRIBUTING`, `AGENTS`).
- ✅ Confirm role propagation, subscription gating, and notification UX.
- ✅ Stand up project management tooling (labels, issue templates, GH Projects/Notion).

---

## Phase 1 – Monetization Foundations (Weeks 1–4)
1. **Stripe Integration**
   - Replace mock `BillingService` with Stripe SDK calls.
   - Create products/prices per seeded plan; store Stripe IDs in `Plan`.
   - Implement secure webhook handler (`/api/webhooks/stripe`) for checkout success, subscription updates, and invoice payment.
2. **Plan Enforcement UX**
   - Surface upgrade prompts when `SubscriptionService.checkLimits()` detects violations.
   - Add billing section in dashboard with plan comparison, invoice history, cancellation flow.
3. **Self-Serve Organization Management**
   - Invite flow (email + token), member management (roles, status), pending invites queue.
   - Audit log of org events (project created, API key created, billing actions).

Deliverable: Functional billing + org admin for closed beta customers.

---

## Phase 2 – Admin & Enterprise Controls (Weeks 5–8)
1. **Platform Admin Console**
   - Build `/admin` dashboard for user search, org overview, plan overrides, support tooling.
   - Role-gated access (SUPER_ADMIN) with proper audit logging.
2. **Advanced Security**
   - Enforce email verification, 2FA hooks, passwordless login fallback.
   - Session management (revoke sessions, sign-out everywhere).
3. **Usage Analytics**
   - Visualize `UsageRecord` data (charts for API calls, storage, seats).
   - Export usage & billing data (CSV, API).
4. **Compliance & Data Governance**
   - Data retention policies, soft deletes, GDPR export hooks.

Deliverable: Internal ops-ready system with compliance controls for enterprise deals.

---

## Phase 3 – Growth & Ecosystem (Weeks 9–14)
1. **API & SDK Enhancements**
   - Expand `/api` surface (webhook management, feature flags, reporting endpoints).
   - Generate TypeScript SDK / OpenAPI spec.
2. **Marketplace Integrations**
   - OAuth with additional providers (Microsoft, Slack).
   - Zapier / Make connectors leveraging API keys.
3. **Marketing Site & Onboarding**
   - Public landing pages (pricing, features) with CMS or MDX.
   - Guided onboarding within the app (checklists, tooltips).
4. **Experimentation**
   - Feature flag framework, cohort analysis, in-app announcements.

Deliverable: Self-serve growth engine with integrations and marketing collateral.

---

## Phase 4 – Reliability & Scale (Ongoing)
- **Observability**: Structured logging, metrics dashboards (Datadog, Grafana), alerting via PagerDuty.
- **Performance**: Load testing, caching strategy (Redis, ISR), rate limits.
- **DevEx**: Merge queue automation, preview environments, smoke test suites.
- **Internationalization**: i18n setup, multi-region deployment strategy.

---

## Success Metrics
- Time-to-live for new customers (signup → first value).
- Conversion rate from Free → Paid plans.
- Monthly churn percentage per plan.
- System uptime / incident count.
- Deployment frequency & lead time for changes.

Use these metrics to prioritize backlog items and iterate on the roadmap.
