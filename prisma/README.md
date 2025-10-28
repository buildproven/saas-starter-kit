# Database Schema

This project uses Prisma with PostgreSQL for the database layer. The schema is designed for a modern SaaS application with multi-tenancy, subscription management, and usage tracking.

## Schema Overview

### Core Models

- **User**: Authentication and user management (NextAuth.js compatible)
- **Account/Session**: OAuth provider accounts and session management
- **Organization**: Multi-tenant organizations with member management
- **Subscription**: Stripe-compatible subscription management
- **Plan**: Subscription plans with configurable features

### SaaS Features

- **Project**: Organization-scoped projects for resource organization
- **ApiKey**: API authentication with usage tracking
- **UsageRecord**: Detailed usage metrics for billing and analytics

## Getting Started

1. **Setup Database**:
   ```bash
   # Generate Prisma client
   npm run db:generate

   # Push schema to database (development)
   npm run db:push

   # Seed with sample data
   npm run db:seed
   ```

2. **Database Studio**:
   ```bash
   npm run db:studio
   ```

## Environment Variables

Required environment variables:
```
DATABASE_URL="postgresql://user:password@localhost:5432/database"
```

## Schema Features

### Multi-tenancy
Organizations serve as the primary tenant boundary. Users can belong to multiple organizations with different roles.

### Subscription Management
- Stripe-compatible subscription tracking
- Plan features stored as JSON for flexibility
- Support for monthly/yearly billing cycles

### Usage Tracking
- Granular usage metrics by project or API key
- Indexed for efficient querying and reporting
- Designed for real-time billing calculations

### API Authentication
- Secure API key management with hashing
- Organization and user-scoped keys
- Usage tracking per API key

## Database Utilities

The `src/lib/db-utils.ts` file provides helpful functions for common operations:

- Organization management
- Subscription lifecycle
- Usage recording and querying
- API key management
- Member management

## Security Considerations

- All API keys are hashed before storage
- Proper cascade deletes prevent orphaned data
- Indexed queries for performance
- Role-based access control at the organization level