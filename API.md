# API Reference

This document describes the REST endpoints exposed by the SaaS Starter Template. All routes are located under the Next.js App Router (`src/app/api`). Unless noted as **Public**, endpoints require an authenticated NextAuth session (JWT strategy) and will return `401 Unauthorized` when accessed without the session cookie. Some routes additionally enforce role-based access (`USER`, `ADMIN`, `SUPER_ADMIN`) through middleware and per-route guards.

## Authentication

NextAuth handles OAuth flows under `/api/auth/*` and sets an HTTP-only session cookie. Use the built-in sign-in page (`/auth/signin`) or call `signIn()` from the NextAuth client. There is no bespoke token issuance endpoint.

## Health & Utility

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Returns API uptime, DB connectivity check, environment, and app version. |
| `GET` | `/api/hello` | Public | Sample endpoint responding with `{ message: "Hello from the API!" }`. |
| `POST` | `/api/hello` | Public | Echoes posted JSON; returns `400` if body is not valid JSON. |

## Organizations

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/organizations` | User | Lists organizations where the caller is owner or active member. Includes subscription summary, member counts, and caller role. |
| `POST` | `/api/organizations` | User | Creates a new organization and assigns caller as `OWNER`. Body requires `name`, `slug`, optional `description`. Returns `409` if slug already exists. |

Responses include derived fields:
```json
{
  "organizations": [
    {
      "id": "org_123",
      "name": "Acme Inc.",
      "slug": "acme",
      "userRole": "OWNER",
      "subscription": {
        "status": "ACTIVE",
        "currentPeriodEnd": "2024-05-01T00:00:00.000Z",
        "plan": { "name": "Pro", "features": { "maxProjects": 50, "...": "..." } }
      }
    }
  ]
}
```

## Projects

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/projects` | User | Lists projects accessible to the caller. Supports `organizationId`, `status`, `page`, and `limit` query params. |
| `POST` | `/api/projects` | User | Creates a project in an organization. Caller must be `MEMBER` or higher and within subscription limits. Body: `{ name, organizationId, description?, status? }`. Returns `402` if plan limit exceeded. |

## API Keys

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/api-keys` | User | Lists API keys for organizations the caller can access. Optional `organizationId` filter. Keys are returned hashed with `status` metadata. |
| `POST` | `/api/api-keys` | User (Admin+) | Creates an API key for an organization. Caller must be `ADMIN`/`OWNER`. Body: `{ name, organizationId, expiresAt?, scopes? }`. Response returns the plaintext key **once**; store it securely. |

## Plans

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/plans` | User | Returns active subscription plans plus the default free tier. Each item includes pricing display metadata and feature limits. |
| `POST` | `/api/plans` | Super Admin | Creates a custom plan with feature definitions. Body validates via Zod; returns `409` if `priceId` already exists. |

## Subscriptions

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/subscriptions` | User | Without params, returns all subscriptions for caller's organizations plus current usage & limit checks. With `organizationId`, narrows to a single org. |
| `POST` | `/api/subscriptions` | User (Owner/Admin) | Creates a subscription record after successful checkout/webhook. Body requires Stripe identifiers (`priceId`, `customerId`, `subscriptionId`, period timestamps). |
| `PUT` | `/api/subscriptions?subscriptionId=...` | User (Owner/Admin) | Updates subscription status/period metadata (e.g., cancel at period end). |

Responses follow:
```json
{
  "subscription": {
    "status": "ACTIVE",
    "currentPeriodEnd": "2024-05-01T00:00:00.000Z",
    "plan": { "name": "Pro" }
  },
  "usage": { "projects": 12, "apiKeys": 3 },
  "limits": { "maxProjects": 50, "maxApiKeys": 50 }
}
```

## Billing (Stripe Helpers)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/billing/checkout` | User (Owner/Admin) | Creates a checkout session for the selected `priceId`. Returns session URL. Guards against duplicate active subscriptions. |
| `GET` | `/api/billing/checkout` | User (Owner/Admin) | Validates a checkout completion by `session_id` and `organizationId`. Currently returns mock success. |
| `POST` | `/api/billing/portal` | User (Owner/Admin) | Creates a Stripe customer portal session. Requires `organizationId`, optional `returnUrl`. Returns portal URL. |
| `GET` | `/api/billing/portal` | User (Owner/Admin) | Shortcut redirect that creates a portal session and issues an HTTP redirect. |

> **Note:** `BillingService` ships with live Stripe SDK integrations. Ensure your environment variables include valid Stripe API keys and price identifiers before using the billing APIs.

## User Profile

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/user/profile` | User | Returns profile metadata, organization summary, and stats. |
| `PUT` | `/api/user/profile` | User | Updates profile fields (`name`, `email`, `image`, etc.). Email changes reset verification. |
| `DELETE` | `/api/user/profile` | User | Deletes account after confirming `{"confirmDelete": true}` and verifying the user does not own active organizations. |

## Protected Utilities

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/protected/user` | User | Returns the authenticated user's basic profile as proof of auth. |
| `PUT` | `/api/protected/user` | User | Updates the user's `name`; sample for protected mutations. |
| `GET` | `/api/admin/users` | Admin | Paginates user accounts (mock data by default). |
| `POST` | `/api/admin/users` | Super Admin | Creates a new user record (mock). Only `SUPER_ADMIN` can create admin/super-admin accounts. |

These endpoints rely on middleware (`src/middleware.ts`) and helpers (`src/lib/auth/api-protection.ts`) to enforce role hierarchy:

- `USER` (default) – signed-in user.
- `ADMIN` – elevated organization/admin-only endpoints.
- `SUPER_ADMIN` – platform-level operations (plan management, admin creation).

## Error Handling

- Validation errors return `400` with Zod issue details.
- Authorization failures use `401` (unauthenticated) or `403` (insufficient role).
- Resource conflicts use `409 Conflict`.
- Payment/plan limits return `402 Payment Required` when appropriate.
- Server issues respond with `500` and log via `src/lib/error-logging.ts` (Sentry integration).

## Rate Limiting & Security

- Middleware ensures public routes (`/`, `/auth/*`, `/api/health`, `/api/hello`) remain accessible without auth.
- Server-side helpers (`withAuth`, `withAdminAuth`, `withSuperAdminAuth`) ensure API routes short-circuit when sessions or roles are missing.
- Webhook processing under `src/app/api/webhooks` still requires production-grade reconciliation (idempotency, error handling) before launch.

## Comprehensive Examples

### Organization Management Flow

#### Creating an Organization
```bash
# Create new organization
curl -X POST http://localhost:3000/api/organizations \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "name": "Acme Corp",
    "slug": "acme-corp",
    "description": "Software development company"
  }'

# Response (201 Created)
{
  "organization": {
    "id": "org_123",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "description": "Software development company",
    "ownerId": "user_456",
    "createdAt": "2024-11-02T10:00:00Z",
    "userRole": "OWNER",
    "_count": {
      "members": 1,
      "projects": 0,
      "apiKeys": 0
    }
  }
}
```

#### Adding Team Members
```bash
# Add member to organization
curl -X POST http://localhost:3000/api/organizations/org_123/members \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "email": "developer@acme.com",
    "role": "ADMIN"
  }'

# Response (201 Created)
{
  "member": {
    "id": "member_789",
    "role": "ADMIN",
    "status": "PENDING",
    "user": {
      "email": "developer@acme.com",
      "name": "Jane Developer"
    },
    "invitedAt": "2024-11-02T10:05:00Z"
  }
}
```

### API Key Management

#### Creating API Keys
```bash
# Create API key for organization
curl -X POST http://localhost:3000/api/api-keys \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "name": "Production API Key",
    "organizationId": "org_123",
    "expiresAt": "2025-11-02T10:00:00Z"
  }'

# Response (201 Created)
{
  "apiKey": {
    "id": "key_abc123",
    "name": "Production API Key",
    "key": "sk_1234567890abcdef...",
    "createdAt": "2024-11-02T10:10:00Z",
    "expiresAt": "2025-11-02T10:00:00Z",
    "status": "active",
    "organization": {
      "id": "org_123",
      "name": "Acme Corp",
      "slug": "acme-corp"
    }
  },
  "message": "API key created successfully. Please save this key securely as it will not be shown again."
}
```

### Subscription & Billing

#### Upgrading Plan
```bash
# Upgrade to Pro plan
curl -X POST http://localhost:3000/api/subscriptions/upgrade \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "organizationId": "org_123",
    "newPriceId": "price_pro_monthly"
  }'

# Response (200 OK)
{
  "subscription": {
    "id": "sub_xyz789",
    "status": "active",
    "currentPeriodStart": "2024-11-02T10:15:00Z",
    "currentPeriodEnd": "2024-12-02T10:15:00Z",
    "plan": {
      "name": "Pro",
      "priceId": "price_pro_monthly",
      "amount": 4900,
      "interval": "MONTH"
    }
  },
  "message": "Subscription upgraded successfully"
}
```

#### Checking Usage Limits
```bash
# Get current usage and limits
curl http://localhost:3000/api/subscriptions/usage \
  -H "Cookie: next-auth.session-token=..." \
  -d '{"organizationId": "org_123"}'

# Response (200 OK)
{
  "usage": {
    "users": 5,
    "projects": 12,
    "apiKeys": 8,
    "apiCallsThisPeriod": 45000,
    "storageGB": 2.5
  },
  "limits": {
    "maxUsers": 25,
    "maxProjects": 50,
    "maxApiKeys": 50,
    "maxApiCallsPerMonth": 1000000,
    "maxStorageGB": 100
  },
  "violations": [],
  "hasViolations": false
}
```

## Error Handling Examples

### Common Error Responses

#### Validation Error (400 Bad Request)
```json
{
  "error": "Invalid input",
  "details": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "String must contain at least 1 character(s)",
      "path": ["name"]
    }
  ]
}
```

#### Authorization Error (403 Forbidden)
```json
{
  "error": "Insufficient permissions",
  "details": {
    "required": "ADMIN",
    "current": "MEMBER"
  }
}
```

#### Subscription Limit Error (402 Payment Required)
```json
{
  "error": "Subscription limit exceeded",
  "details": {
    "feature": "maxProjects",
    "limit": 10,
    "current": 10,
    "upgradeRequired": true
  }
}
```

#### Resource Not Found (404 Not Found)
```json
{
  "error": "Organization not found"
}
```

#### Resource Conflict (409 Conflict)
```json
{
  "error": "Organization slug already exists",
  "details": {
    "field": "slug",
    "value": "acme-corp"
  }
}
```

## Advanced Usage Patterns

### Webhook Integration
```bash
# Handle Stripe webhook
curl -X POST http://localhost:3000/api/webhooks/subscription \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=..." \
  -d '{
    "type": "customer.subscription.updated",
    "data": {
      "object": {
        "id": "sub_xyz789",
        "status": "active",
        "items": {
          "data": [{
            "price": {"id": "price_pro_monthly"}
          }]
        }
      }
    }
  }'
```

### Bulk Operations
```bash
# Bulk invite members
curl -X POST http://localhost:3000/api/organizations/org_123/members/bulk \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "invites": [
      {"email": "dev1@acme.com", "role": "MEMBER"},
      {"email": "dev2@acme.com", "role": "MEMBER"},
      {"email": "admin@acme.com", "role": "ADMIN"}
    ]
  }'
```

### Pagination & Filtering
```bash
# Get paginated projects with filters
curl "http://localhost:3000/api/projects?organizationId=org_123&status=active&page=2&limit=10" \
  -H "Cookie: next-auth.session-token=..."

# Response includes pagination metadata
{
  "projects": [...],
  "pagination": {
    "page": 2,
    "limit": 10,
    "total": 47,
    "pages": 5,
    "hasNext": true,
    "hasPrevious": true
  }
}
```

## Rate Limiting & Performance

- API endpoints implement per-user rate limiting (100 requests/minute)
- Bulk operations have separate limits (10 requests/minute)
- WebSocket connections for real-time updates (coming soon)
- Response caching for frequently accessed data

## SDK & Client Libraries

### JavaScript/TypeScript SDK
```typescript
import { SaasClient } from '@acme/saas-sdk'

const client = new SaasClient({
  apiKey: 'sk_1234567890abcdef...',
  baseUrl: 'https://api.acme.com'
})

// Type-safe API calls
const organizations = await client.organizations.list()
const project = await client.projects.create({
  name: 'New Project',
  organizationId: 'org_123'
})
```

For more implementation details, review `ARCHITECTURE.md` and the code comments within each route file.
