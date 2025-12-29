# Roadmap

> Strategic direction and planned features for SaaS Starter Kit

## Development Philosophy

**AI-accelerated development**: Features are built in hours/days, not weeks/months. Traditional quarterly roadmaps don't apply when using Claude, Cursor, and AI coding tools.

- **New feature**: 2-8 hours typical
- **Complex system**: 1-2 days
- **Full module (auth, billing, etc.)**: Already done - that's the point of a starter kit

**Business timelines may differ**: Customer acquisition, revenue ramp, and market penetration follow normal curves regardless of build speed.

## Current Status

Production-ready foundation with core features complete.

## Completed

- [x] Core authentication with Supabase (Google/GitHub/email OAuth)
- [x] Multi-tenant data model (Organizations, Projects, API Keys, Plans)
- [x] Stripe billing integration (checkout, billing portal, webhooks)
- [x] Smart Test Strategy (risk-based pre-push validation)
- [x] RBAC middleware (USER, ADMIN, SUPER_ADMIN roles)
- [x] Structured logging with Pino
- [x] Prometheus metrics collection
- [x] Rate limiting infrastructure
- [x] Environment validation at startup
- [x] Security hardening (path traversal, retry logic)

## In Progress (This Week)

- [ ] Production observability - Grafana dashboards (~2 hours)
- [ ] Health check endpoint (~30 min)
- [ ] Database connection pooling optimization (~1 hour)

## Ready to Build (When Prioritized)

**Team Collaboration** (~4-6 hours):

- [ ] Team invitations and member management
- [ ] Role-based permissions per organization
- [ ] Activity audit log

**Analytics Dashboard** (~4 hours):

- [ ] Usage metrics visualization
- [ ] Revenue analytics
- [ ] User engagement tracking

**Email System** (~2-3 hours):

- [ ] Transactional emails (welcome, invoice, alerts)
- [ ] Email templates with customization
- [ ] Notification preferences

**Webhooks** (~2 hours):

- [ ] Configure outgoing webhooks
- [ ] Webhook delivery logs and retry

**Enterprise** (~1 day):

- [ ] SSO/SAML
- [ ] Custom branding per organization
- [ ] Multi-region deployment support

---

See [BACKLOG.md](BACKLOG.md) for tactical work items and bug tracking.
