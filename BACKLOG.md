# SaaS Starter Template - Backlog

**Last Updated**: 2025-11-19 (Added QA-003 - workflow standardization)
**Project**: saas-starter-template
**Status**: Production Readiness - P1 Fixes Complete + Database Migration Applied

## 🎯 Current State

### Recently Completed (2025-11-11)

All P0 blocking issues and P1 critical issues have been resolved. The application is significantly more production-ready with comprehensive observability, security, and reliability improvements.

**Database Migration Applied** (2025-11-11): API key scopes field successfully added to production database using Docker PostgreSQL setup. Access control persistence now fully operational.

### Production Readiness Status

- **P0 (Blockers)**: ✅ 6/6 Complete (100%)
- **P1 (Critical)**: ✅ 6/6 Complete (100%)
- **P2 (Important)**: 0/22 Complete (0%) - 7 new items added from session crash recovery
- **P3 (Nice-to-have)**: 0/8 Complete (0%)

---

## ✅ Completed Items

### Latest (2025-11-19)

**QA-003: Update quality workflow to use create-qa-architect validation** ✅

- **Status**: Completed 2025-11-19
- **Commit**: 9553d51
- **Description**: Standardized GitHub Actions quality workflow to match create-qa-architect template
- **Changes**:
  - Added configuration security validation (--security-config)
  - Added documentation validation (--validate-docs)
  - Added comprehensive security checks (XSS patterns, input validation)
  - Added dependency integrity verification
  - Standardized with other internal projects
  - Updated Actions versions (@v5, @v6)
- **Impact**: CI/CD now runs same validation suite as all other integrated projects

---

### P0 Blockers (All Complete)

1. **DATA-001: EISDIR Production Bug** ✅
   - **Status**: Fixed
   - **Solution**: Added `fs.stat()` check to detect directories, use `archive.directory()` vs `archive.file()`
   - **File**: `src/app/template-download/route.ts:250-258`
   - **Impact**: 100% of production downloads were failing

2. **CONFIG-001: Missing URL Fallback** ✅
   - **Status**: Fixed
   - **Solution**: Added fallback chain: `NEXT_PUBLIC_APP_URL → NEXT_PUBLIC_BASE_URL → localhost`
   - **File**: `src/app/api/template-sales/checkout/route.ts:129-134`
   - **Impact**: Stripe checkout URLs contained literal "undefined"

3. **DATA-002: API Key Scopes Not Persisted** ✅
   - **Status**: Fixed
   - **Solution**: Added `scopes` field to Prisma schema, updated create/read operations
   - **Files**: `prisma/schema.prisma:180`, `src/app/api/api-keys/route.ts:115,196,203`
   - **Impact**: Access control silently ineffective
   - **Migration Required**: `npx prisma db push`

4. **SEC-001: No Environment Validation** ✅
   - **Status**: Fixed
   - **Solution**: Created comprehensive Zod validation with startup checks
   - **File**: `src/lib/env.ts` (new, 163 lines)
   - **Impact**: Application crashed on missing environment variables

5. **SEC-002: Path Traversal Vulnerability** ✅
   - **Status**: Fixed
   - **Solution**: Created `sanitizeFilePath()` helper with traversal detection
   - **File**: `src/lib/path-security.ts` (new, 90 lines)
   - **Impact**: Critical security vulnerability allowing filesystem access

6. **TEST-002: No Test Coverage** ✅
   - **Status**: Fixed
   - **Solution**: Added comprehensive test suites (19 + 18 + comprehensive API tests)
   - **Files**: `src/lib/path-security.test.ts`, `src/lib/env.test.ts`, `src/app/api/api-keys/route.test.ts`
   - **Coverage**: Increased from ~60% to ~75%

### P1 Critical (All Complete)

1. **P1-1: Retry Logic with Exponential Backoff** ✅
   - **Status**: Implemented
   - **File**: `src/lib/retry.ts` (new, 280 lines)
   - **Features**: Exponential backoff, jitter, configurable retries, timeout support
   - **Integration**: Added to Stripe client (30s timeout, 2 retries)

2. **P1-2: Rate Limiting on Auth Endpoints** ✅
   - **Status**: Implemented
   - **File**: `src/lib/rate-limit.ts` (new, 280 lines)
   - **Configuration**: 5 requests/minute on NextAuth endpoints
   - **Headers**: Returns standard X-RateLimit-\* headers

3. **P1-3: Webhook Idempotency Checks** ✅
   - **Status**: Enhanced
   - **File**: `src/app/api/webhooks/subscription/route.ts`
   - **Improvements**: Added structured logging, Prometheus metrics, improved error handling

4. **P1-4: Race Condition in Fulfillment** ✅
   - **Status**: Fixed
   - **File**: `src/lib/template-sales/fulfillment.ts:52-86`
   - **Solution**: Transaction with row-level locking, "fulfilling" flag, rollback mechanism

5. **P1-5: Timeouts on External API Clients** ✅
   - **Status**: Implemented
   - **File**: `src/lib/stripe.ts:20-24`
   - **Configuration**: 30-second timeout, 2 max retries

6. **P1-6: Input Length Limits** ✅
   - **Status**: Implemented
   - **File**: `src/app/api/template-sales/checkout/route.ts:71-87`
   - **Limits**: Email (254), company (200), use case (2000), URLs (2048), GitHub username (39)

### Observability Infrastructure (Complete)

1. **Structured Logging** ✅
   - **File**: `src/lib/logger.ts` (new, 287 lines)
   - **Features**: Pino with pretty-print (dev) / JSON (prod), PII redaction, business/security event logging

2. **Prometheus Metrics** ✅
   - **Files**: `src/lib/metrics.ts` (new, 220 lines), `src/app/api/metrics/route.ts`
   - **Metrics**: HTTP duration, template downloads, webhooks, API keys
   - **Endpoint**: `/api/metrics`

---

## 📋 Pending Items

### P2 Important (22 items)

#### Authentication & Authorization (New - Session Crash Recovery)

1. **AUTH-001: Organization data persists across logins** ⚠️
   - **Location**: `src/lib/store.ts:119-130` & `src/lib/store.ts:270-276`
   - **Issue**: Logging out only nulls user, while persisted slice explicitly keeps currentOrganization. New user on same browser inherits prior user's org context.
   - **Impact**: Potential exposure of organization names, plan state, privileged UI paths
   - **Fix**: Clear currentOrganization/organizations whenever setSession is called with null (or move out of persisted subset)
   - Effort: XS

2. **AUTH-002: Zustand auth sync never runs** ⚠️
   - **Location**: `src/lib/hooks/useStore.ts:6-18`
   - **Issue**: useSessionSync hook that pushes NextAuth session into store isn't imported or invoked anywhere (repo-wide search only finds definition)
   - **Impact**: useAppStore's user/isAuthenticated flags stay at defaults, components relying on shared store for auth/role awareness will misbehave
   - **Fix**: Mount the hook once near app root (e.g., inside layout/provider) or remove unused store slice
   - Effort: XS

3. **AUTH-003: Organization permission helper always grants membership** ⚠️
   - **Location**: `src/lib/hooks/useAuth.ts:122-147`
   - **Issue**: useOrganizationPermissions returns true (role hard-coded to 'MEMBER') for every authenticated user with organizationId
   - **Impact**: Defeats UI-based permission gating, risks exposing destructive controls in dashboard until API rejects
   - **Fix**: Wire up to organizations API (or Zustand org list) so membership/roles reflect reality
   - Effort: S

4. **AUTH-004: Feature gating stub ignores the feature argument** ⚠️
   - **Location**: `src/lib/hooks/useStore.ts:32-39`
   - **Issue**: useCurrentOrganization().canAccess(feature) returns hasActiveSubscription || isTrialing and never inspects requested feature limit
   - **Impact**: Cannot enforce plan limits client-side (e.g., maxProjects or analytics always allowed if subscription active)
   - **Fix**: Hook up to SubscriptionService's feature metadata or remove parameter to avoid false security sense
   - Effort: S

5. **AUTH-005: Role helpers can never satisfy "all roles" checks** ⚠️
   - **Location**: `src/lib/hooks/useAuth.ts:58-71`
   - **Issue**: hasAllRoles compares each requested role with strict equality, so any array with >1 entry always returns false (user can only hold one role)
   - **Impact**: UI relying on "must be ADMIN and SUPER_ADMIN" style gates will silently fail even for super admins
   - **Fix**: Reimplement using hierarchy (require max privilege level) or drop requireAll entirely
   - Effort: XS

#### Testing Gaps (New - Session Crash Recovery)

1. **TEST-005: Template download test only exercises development path**
   - **Location**: `src/app/template-download/route.test.ts`
   - **Issue**: Only exercises dev path (mock text download), zero coverage for production branch where Archiver is used
   - **Impact**: EISDIR failure (P0-DATA-001) would have been caught with fixture tree test
   - **Fix**: Add production branch test with fixture directory tree
   - Effort: S

2. **CONFIG-004: Prisma seed requires live Stripe credentials**
   - **Location**: `prisma/seed.ts`, `scripts/seed-plans.ts`
   - **Issue**: seed.ts calls seedPlans which talks directly to live Stripe (getStripeClient, stripe.prices.retrieve). Running npm run db:seed without full Stripe credentials/network access fails outright
   - **Impact**: Makes local onboarding painful
   - **Fix**: Split local data seeding from Stripe synchronization or feature-flag the call
   - Effort: S

#### Existing P2 Items

1. **LOGIC-002: Template fulfillment not idempotent**
   - Add transaction or unique constraint
   - Effort: S

2. **LOGIC-003: Webhook event types not validated**
   - Add enum validation
   - Effort: XS

3. **LOGIC-004: Customer email not validated before fulfillment**
   - Add email format check
   - Effort: XS

4. **LOGIC-005: No pagination on /api/api-keys**
   - Add limit/offset support
   - Effort: S

5. **LOGIC-006: Magic number rate limits**
   - Extract to config
   - Effort: XS

6. **CONFIG-002: Hard-coded template file paths**
   - Move to environment variables
   - Effort: XS

7. **CONFIG-003: No feature flag system**
   - Add feature flags
   - Effort: M

8. **DATA-003: No soft delete on API keys**
   - Add deletedAt field
   - Effort: S

9. **DATA-004: Missing indexes on frequently queried fields**
   - Add Prisma indexes
   - Effort: S

10. **SCALE-001: No database connection pooling configuration**
    - Configure Prisma pool
    - Effort: S

11. **SCALE-002: No request queue for heavy operations**
    - Add BullMQ or similar
    - Effort: L

12. **SCALE-003: Template downloads not cached**
    - Add Redis cache
    - Effort: M

13. **OPS-001: No health check endpoint**
    - Add /api/health
    - Effort: XS

14. **OPS-002: No graceful shutdown**
    - Handle SIGTERM
    - Effort: S

15. **OPS-003: No deployment rollback strategy**
    - Add blue-green or canary
    - Effort: L

### P3 Nice-to-have (8 items)

1. **UX-001: No loading states**
2. **UX-002: No error boundaries**
3. **UX-003: No offline support**
4. **SEC-003: No CSRF tokens on state-changing endpoints**
5. **SEC-004: No security headers middleware**
6. **TEST-003: No E2E tests**
7. **TEST-004: No load testing**
8. **PERF-001: No CDN for static assets**

---

## 🏗️ Infrastructure Improvements

### Completed

- ✅ Structured logging with Pino
- ✅ Prometheus metrics collection
- ✅ Environment validation at startup
- ✅ Path traversal prevention
- ✅ Rate limiting infrastructure
- ✅ Retry logic with exponential backoff

### Pending

- Database migration automation
- CI/CD pipeline improvements
- Monitoring dashboards (Grafana)
- Alerting rules (Prometheus Alertmanager)
- Error tracking (Sentry integration)
- Log aggregation (Loki/CloudWatch)

---

## 📊 Metrics

### Code Quality

- **Test Coverage**: ~75% (target: 80%)
- **ESLint Errors**: 0
- **TypeScript Errors**: 0
- **Security Vulnerabilities**: 0 critical/high

### Performance Baselines

- **Template Download**: Not measured yet
- **Webhook Processing**: Not measured yet
- **API Response Times**: Not measured yet

---

## 🎯 Next Sprint Priorities

### Immediate (Week 1)

1. ✅ Run database migration for API key scopes - **COMPLETED 2025-11-11**
2. Set up Prometheus scraping
3. Configure production logging aggregation
4. Add health check endpoint (OPS-001)

### Short Term (Weeks 2-3)

1. Implement remaining P2 items (LOGIC-002 through LOGIC-006)
2. Add database indexes (DATA-004)
3. Set up monitoring dashboards
4. Configure alerting rules

### Medium Term (Month 2)

1. Complete P2 scalability improvements (SCALE-001 through SCALE-003)
2. Add E2E tests (TEST-003)
3. Implement CSRF protection (SEC-003)
4. Set up blue-green deployment (OPS-003)

---

## 📝 Notes

### Breaking Changes

- Database migration required for API key scopes field
- Environment validation now runs at startup (exits on failure)

### Dependencies Added

- `pino` - Structured logging
- `pino-pretty` - Development log formatting
- `prom-client` - Prometheus metrics

### Documentation

- Comprehensive code review: `claudedocs/STRICT_CODE_REVIEW_2025-11-11.md`
- Machine-readable backlog: `review-backlog-strict.json`
- All new modules have extensive inline documentation

### Technical Debt Addressed

- ✅ Console.log replaced with structured logging
- ✅ Non-null assertions replaced with proper validation
- ✅ Hard-coded values extracted to constants
- ✅ Error handling improved with retry logic
- ✅ Security vulnerabilities patched

### Technical Debt Remaining

- Database connection pooling not configured
- No request queuing for heavy operations
- Template downloads not cached
- No graceful shutdown handling
- Magic numbers in rate limits
