# Developer Guide

A comprehensive guide for developers working with the SaaS Starter Template. This guide covers development workflows, best practices, and common patterns.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Architecture Overview](#architecture-overview)
- [Common Development Patterns](#common-development-patterns)
- [Testing Strategies](#testing-strategies)
- [Deployment & Production](#deployment--production)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites Setup

1. **Node.js & Package Manager**

   ```bash
   # Install Node.js 20+ (recommended via Volta)
   volta install node@20
   volta install npm@10

   # Verify versions
   node --version  # Should be 20+
   npm --version   # Should be 10+
   ```

2. **Database Setup**

   ```bash
   # Option 1: Local PostgreSQL with Docker
   docker run --name saas-postgres \
     -e POSTGRES_PASSWORD=password \
     -e POSTGRES_DB=saas_starter \
     -p 5432:5432 -d postgres:14

   # Option 2: Use a managed service (recommended for production)
   # - Neon, Supabase, PlanetScale, Railway, etc.
   ```

3. **Environment Configuration**

   ```bash
   # Copy and configure environment
   cp .env.example .env.local

   # Required variables:
   # DATABASE_URL="postgresql://user:password@localhost:5432/saas_starter"
   # NEXTAUTH_URL="http://localhost:3000"
   # NEXTAUTH_SECRET="your-secret-here"
   ```

### Quick Development Setup

```bash
# 1. Clone and install
git clone <your-repo>
cd saas-starter-template
npm install

# 2. Database setup
npm run db:push     # Apply schema
npm run db:seed     # Seed with sample data

# 3. Start development
npm run dev

# 4. Open in browser
open http://localhost:3000
```

## Development Workflow

### Daily Development Commands

```bash
# Start development server with hot reload
npm run dev

# Run quality checks (run before committing)
npm run lint        # ESLint validation
npm run typecheck   # TypeScript compilation
npm test            # Full test suite
npm run format      # Auto-format code

# Database operations
npm run db:push     # Apply schema changes
npm run db:generate # Generate Prisma client
npm run db:seed     # Refresh sample data
npm run db:studio   # Open Prisma Studio GUI
```

### Code Quality Standards

The project enforces strict quality standards through automated tooling:

- **ESLint**: Strict rules including security checks
- **TypeScript**: Strict type checking, no `any` types
- **Prettier**: Consistent code formatting
- **Husky**: Pre-commit hooks prevent bad commits
- **Jest**: 80% test coverage requirement

### Git Workflow

```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Make changes and commit
git add .
git commit -m "feat: add new feature"
# (pre-commit hooks will run automatically)

# 3. Push and create PR
git push origin feature/new-feature
# Create PR on GitHub

# 4. After review, merge to main
git checkout main
git pull origin main
git branch -d feature/new-feature
```

## Architecture Overview

### Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # REST API endpoints
│   │   ├── auth/          # NextAuth routes
│   │   ├── organizations/ # Organization management
│   │   ├── projects/      # Project management
│   │   ├── billing/       # Stripe integration
│   │   └── webhooks/      # External webhooks
│   ├── auth/              # Auth pages
│   ├── dashboard/         # Authenticated pages
│   └── (marketing)/       # Public pages
├── components/            # Reusable UI components
│   ├── ui/               # Base components (shadcn/ui)
│   ├── auth/             # Auth-specific components
│   └── dashboard/        # Dashboard components
├── lib/                  # Core utilities & services
│   ├── auth/             # Authentication logic
│   ├── billing/          # Payment processing
│   ├── subscription/     # Subscription management
│   ├── hooks/            # Custom React hooks
│   └── utils/            # Utility functions
└── styles/               # Global styles & themes
```

### Key Technologies

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: NextAuth.js (JWT strategy)
- **Payments**: Stripe integration
- **UI**: Tailwind CSS + shadcn/ui components
- **State**: Zustand for global state
- **Testing**: Jest + React Testing Library
- **Type Safety**: TypeScript strict mode

## Common Development Patterns

### 1. Creating New API Endpoints

```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Input validation schema
const createExampleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Database query
    const examples = await prisma.example.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ examples })
  } catch (error) {
    console.error('Error fetching examples:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate input
    const body = await request.json()
    const validatedData = createExampleSchema.parse(body)

    // Create resource
    const example = await prisma.example.create({
      data: {
        ...validatedData,
        userId: session.user.id,
      },
    })

    return NextResponse.json({ example }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }

    console.error('Error creating example:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### 2. Adding Database Models

```prisma
// prisma/schema.prisma
model Example {
  id          String   @id @default(cuid())
  name        String
  description String?
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("examples")
}
```

After adding models:

```bash
npm run db:push      # Apply schema changes
npm run db:generate  # Update Prisma client
```

### 3. Creating React Components

```typescript
// src/components/example/ExampleCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ExampleCardProps {
  example: {
    id: string
    name: string
    description?: string
    createdAt: string
  }
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export function ExampleCard({ example, onEdit, onDelete }: ExampleCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{example.name}</CardTitle>
          <Badge variant="secondary">
            {new Date(example.createdAt).toLocaleDateString()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {example.description && (
          <p className="text-gray-600 mb-4">{example.description}</p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(example.id)}
          >
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(example.id)}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

### 4. Custom Hooks Pattern

```typescript
// src/lib/hooks/useExamples.ts
import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'

interface Example {
  id: string
  name: string
  description?: string
  createdAt: string
}

export function useExamples() {
  const [examples, setExamples] = useState<Example[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { addNotification } = useAppStore()

  const fetchExamples = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/examples')

      if (!response.ok) {
        throw new Error('Failed to fetch examples')
      }

      const data = await response.json()
      setExamples(data.examples)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      addNotification({
        type: 'error',
        title: 'Error',
        message: errorMessage,
      })
    } finally {
      setLoading(false)
    }
  }

  const createExample = async (data: Omit<Example, 'id' | 'createdAt'>) => {
    try {
      const response = await fetch('/api/examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to create example')
      }

      const result = await response.json()
      setExamples((prev) => [result.example, ...prev])

      addNotification({
        type: 'success',
        title: 'Success',
        message: 'Example created successfully',
      })

      return result.example
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      addNotification({
        type: 'error',
        title: 'Error',
        message: errorMessage,
      })
      throw err
    }
  }

  useEffect(() => {
    fetchExamples()
  }, [])

  return {
    examples,
    loading,
    error,
    createExample,
    refreshExamples: fetchExamples,
  }
}
```

## Testing Strategies

### Unit Testing Components

```typescript
// src/components/example/__tests__/ExampleCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ExampleCard } from '../ExampleCard'

const mockExample = {
  id: '1',
  name: 'Test Example',
  description: 'Test description',
  createdAt: '2024-01-01T00:00:00Z',
}

describe('ExampleCard', () => {
  const mockOnEdit = jest.fn()
  const mockOnDelete = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders example information correctly', () => {
    render(
      <ExampleCard
        example={mockExample}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText('Test Example')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
  })

  it('calls onEdit when edit button is clicked', () => {
    render(
      <ExampleCard
        example={mockExample}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    )

    fireEvent.click(screen.getByText('Edit'))
    expect(mockOnEdit).toHaveBeenCalledWith('1')
  })

  it('calls onDelete when delete button is clicked', () => {
    render(
      <ExampleCard
        example={mockExample}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    )

    fireEvent.click(screen.getByText('Delete'))
    expect(mockOnDelete).toHaveBeenCalledWith('1')
  })
})
```

### API Route Testing

```typescript
// src/app/api/examples/__tests__/route.test.ts
import { GET, POST } from '../route'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'

// Mock dependencies
jest.mock('next-auth/next')
jest.mock('@/lib/prisma', () => ({
  prisma: {
    example: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('/api/examples', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET', () => {
    it('returns examples for authenticated user', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user123' },
      } as any)

      mockPrisma.example.findMany.mockResolvedValue([
        { id: '1', name: 'Example 1', userId: 'user123' },
      ])

      const request = new Request('http://localhost:3000/api/examples')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.examples).toHaveLength(1)
      expect(mockPrisma.example.findMany).toHaveBeenCalledWith({
        where: { userId: 'user123' },
        orderBy: { createdAt: 'desc' },
      })
    })

    it('returns 401 for unauthenticated requests', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const request = new Request('http://localhost:3000/api/examples')
      const response = await GET(request)

      expect(response.status).toBe(401)
    })
  })
})
```

### Integration Testing

```typescript
// src/__tests__/integration/examples.test.ts
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionProvider } from 'next-auth/react'
import ExamplesPage from '@/app/dashboard/examples/page'

// Mock fetch
global.fetch = jest.fn()

const mockSession = {
  user: { id: 'user123', email: 'test@example.com' },
  expires: '2025-01-01',
}

describe('Examples Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ examples: [] }),
    })
  })

  it('loads and displays examples', async () => {
    render(
      <SessionProvider session={mockSession}>
        <ExamplesPage />
      </SessionProvider>
    )

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/examples')
    })

    expect(screen.getByText('Examples')).toBeInTheDocument()
  })
})
```

## Deployment & Production

### Environment Variables

```bash
# Required for all environments
DATABASE_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=

# OAuth providers (choose one or more)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_ID=
GITHUB_SECRET=

# Stripe (for billing)
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Monitoring (optional)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

### Vercel Deployment

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy to preview
vercel

# 3. Configure environment variables
vercel env add DATABASE_URL
vercel env add NEXTAUTH_SECRET
# ... add all required variables

# 4. Deploy to production
vercel --prod
```

### Database Migration Strategy

```bash
# Development
npm run db:push    # Apply schema changes directly

# Production
npx prisma migrate deploy  # Apply pending migrations
npx prisma generate        # Generate client
npm run db:seed           # Seed initial data (first time only)
```

## Troubleshooting

### Common Issues

#### 1. Database Connection Issues

```bash
# Check database is running
docker ps | grep postgres

# Test connection
npm run db:studio

# Reset database
npm run db:push --force-reset
npm run db:seed
```

#### 2. Authentication Problems

```bash
# Clear browser cookies
# Check NEXTAUTH_URL matches your domain
# Verify OAuth app configuration

# Debug mode
NEXTAUTH_DEBUG=true npm run dev
```

#### 3. Build Failures

```bash
# Clear caches
rm -rf .next node_modules
npm install
npm run build

# Check TypeScript errors
npm run typecheck

# Check linting
npm run lint
```

#### 4. Test Failures

```bash
# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Clear test cache
npm test -- --clearCache
```

### Performance Optimization

1. **Database Queries**
   - Use Prisma's `include` and `select` wisely
   - Implement pagination for large datasets
   - Add database indexes for frequently queried fields

2. **Bundle Size**
   - Use dynamic imports for large dependencies
   - Implement code splitting at route level
   - Analyze bundle with `npm run analyze`

3. **Caching**
   - Use Next.js built-in caching
   - Implement API response caching
   - Use browser caching for static assets

### Getting Help

- **Documentation**: Check existing docs in the `/docs` folder
- **Issues**: Create GitHub issues for bugs or questions
- **Community**: Join our Discord server for real-time help
- **Support**: Email support@yourdomain.com for priority assistance

---

This guide covers the essentials of developing with the SaaS Starter Template. For more specific topics, refer to the other documentation files or reach out to the development team.

## Template Sales Notes

The optional template-sales APIs (see `src/app/api/template-sales/*` and `src/lib/template-sales`) require:

- Stripe template product/price IDs (`STRIPE_TEMPLATE_*`).
- `TEMPLATE_FULFILLMENT_SECRET` for internal fulfillment calls.
- Packaged assets stored at `TEMPLATE_FILES_PATH` so download requests succeed.
- An email provider configured in `src/lib/email/template-delivery.ts` if you want automated delivery messages.
- `GITHUB_ACCESS_TOKEN`/`GITHUB_ORG` so Pro/Enterprise buyers receive repository access. Capture GitHub usernames during checkout (the marketing page includes the field) or override later through the admin API at `/api/admin/template-sales/github-access`.
- Download requests are protected by rate limiting (5 requests / 15 minutes per IP+token) and auditable via the `TemplateDownloadAudit` table.
- Run `npm test -- --runInBand src/app/api/template-sales/smoke.test.ts` to exercise the end-to-end template-sales flow (Stripe checkout, fulfillment, GitHub access, download token redemption) using mocked providers before touching production credentials.

Without these values the routes short-circuit with informative errors and no assets are released.

Run `npm run template:package` to rebuild the ZIP/TAR artifacts under `TEMPLATE_FILES_PATH` whenever you change core files.
