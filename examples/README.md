# Code Examples

This directory contains practical examples showing how to extend and customize the SaaS Starter Template for common use cases.

## Directory Structure

```
examples/
├── api-examples/          # Custom API endpoint patterns
├── auth-examples/         # Authentication and authorization patterns
├── billing-examples/      # Stripe integration and billing flows
├── component-examples/    # UI component patterns
├── database-examples/     # Database operations and schema extensions
├── middleware-examples/   # Custom middleware implementations
├── testing-examples/      # Testing patterns and utilities
└── deployment-examples/   # Deployment configurations and scripts
```

## Quick Navigation

- **New to the template?** Start with [basic-crud-api.ts](./api-examples/basic-crud-api.ts)
- **Need authentication?** Check [role-based-access.tsx](./auth-examples/role-based-access.tsx)
- **Adding billing?** See [subscription-upgrade.ts](./billing-examples/subscription-upgrade.ts)
- **Custom components?** Review [data-table.tsx](./component-examples/data-table.tsx)
- **Database changes?** Look at [schema-extension.prisma](./database-examples/schema-extension.prisma)

## Usage Guidelines

1. **Copy and adapt**: These examples are meant to be copied into your project and modified for your specific needs.
2. **Follow patterns**: Each example follows the established patterns in the template (error handling, validation, etc.).
3. **Test thoroughly**: All examples include corresponding test files showing testing patterns.
4. **Keep updated**: Examples are maintained to work with the latest template version.

## Contributing Examples

Have a useful pattern to share? Please:
1. Follow the existing example structure
2. Include comprehensive documentation
3. Add corresponding test files
4. Submit a PR with clear description

## Example Categories

### API Examples
- CRUD operations with validation
- File upload handling
- Rate limiting implementation
- Webhook processing
- API key authentication

### Authentication Examples
- Custom OAuth providers
- Role-based component rendering
- Multi-tenant user management
- Session management patterns
- API protection patterns

### Billing Examples
- Stripe webhook handling
- Usage-based billing
- Plan upgrade/downgrade flows
- Invoice generation
- Payment method management

### Component Examples
- Data tables with sorting/filtering
- Form validation patterns
- File upload components
- Dashboard widgets
- Modal and dialog patterns

### Database Examples
- Schema migration patterns
- Complex query examples
- Data seeding strategies
- Performance optimization
- Backup and restore

### Testing Examples
- API route testing
- Component testing with mocks
- Integration test patterns
- E2E testing setup
- Performance testing

## Getting Help

- Check the main [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) for detailed explanations
- Review [API.md](../API.md) for endpoint documentation
- See [ARCHITECTURE.md](../ARCHITECTURE.md) for system design
- Ask questions in GitHub Issues or Discussions