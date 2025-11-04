# 🚀 Quickstart Guide

Get your SaaS application running in under 10 minutes.

## Prerequisites Check

- [ ] Node.js ≥ 20 installed
- [ ] PostgreSQL running (local or remote)
- [ ] npm ≥ 10

## 1-Minute Setup

```bash
# Clone and install
git clone <your-repo-url>
cd saas-starter-template
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your database URL and basic settings

# Initialize database
npm run db:push
npm run db:seed

# Start development
npm run dev
```

Visit `http://localhost:3000` - you're ready to build!

## Essential Environment Variables

The absolute minimum to get started:

```env
# Required
DATABASE_URL="postgresql://username:password@localhost:5432/saas_starter"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# Optional for local development
GOOGLE_CLIENT_ID="your-google-oauth-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-secret"
```

### Optional: Template Sales Setup

If you plan to sell this template itself, configure these additional variables:

```env
# Stripe price IDs for each package tier
STRIPE_TEMPLATE_BASIC_PRICE_ID="price_..."
STRIPE_TEMPLATE_PRO_PRICE_ID="price_..."
STRIPE_TEMPLATE_ENTERPRISE_PRICE_ID="price_..."

# Internal secrets and asset configuration
TEMPLATE_FULFILLMENT_SECRET="super-long-random-string"
TEMPLATE_FILES_PATH="./template-files" # absolute path recommended in production
RESEND_API_KEY="" # optional Resend email integration
GITHUB_ACCESS_TOKEN="" # required for GitHub repo invitations (Pro/Enterprise)
GITHUB_ORG="" # organization that owns the template repos
```

Create the packaging files under `TEMPLATE_FILES_PATH` before fulfilling real orders. When you update the template, run `npm run template:package` to regenerate the archives. If you are not selling the template, you can skip this step.

The marketing purchase page now asks buyers for a GitHub username so Pro/Enterprise customers can be granted repository access without manual work. If the handle changes later, SUPER_ADMIN operators can call `POST /api/admin/template-sales/github-access` with the new username to retry the invitation.

## Quick Test Checklist

> `npm run build` skips the Postgres health check by default. Set `SKIP_DB_HEALTHCHECK=false` before the command if you want to verify database connectivity during builds.

- [ ] App loads at `http://localhost:3000`
- [ ] `/api/health` returns green status
- [ ] Sign in works (test user or OAuth)
- [ ] Dashboard accessible after auth
- [ ] API endpoints respond correctly

## Common First Steps

1. **Customize branding**: Update `src/app/page.tsx` and `src/components/ui/*`
2. **Add your domain logic**: Create new API routes in `src/app/api/`
3. **Update database schema**: Modify `prisma/schema.prisma`
4. **Configure OAuth providers**: Add client IDs to `.env.local`
5. **Test billing flows**: Set up Stripe test keys

## Development Commands

| Command             | Purpose                          |
| ------------------- | -------------------------------- |
| `npm run dev`       | Start dev server with hot reload |
| `npm run build`     | Build for production             |
| `npm test`          | Run all tests                    |
| `npm run lint`      | Check code quality               |
| `npm run db:studio` | Open Prisma Studio               |

## Next Steps

- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- Check [API.md](./API.md) for endpoint documentation
- Read [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for detailed workflows
- See [DEPLOYMENT.md](./DEPLOYMENT.md) when ready to deploy

## Troubleshooting

**Database connection fails?**

- Ensure PostgreSQL is running
- Check `DATABASE_URL` format
- Verify user permissions

**OAuth not working?**

- Confirm callback URLs in provider settings
- Check client ID/secret pairs
- Ensure `NEXTAUTH_URL` matches your domain

**Build errors?**

```bash
npm run lint        # Fix code issues
npm run typecheck   # Fix TypeScript errors
npm test            # Verify functionality
```

**Need help?** Check the [Issues](./CONTRIBUTING.md#questions--support) section.
