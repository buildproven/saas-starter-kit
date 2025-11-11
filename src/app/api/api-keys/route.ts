import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import crypto from 'crypto'

// Input validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  organizationId: z.string(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).default(['read']),
})

// Helper function to generate API key
function generateApiKey(): string {
  const prefix = 'sk_'
  const randomBytes = crypto.randomBytes(32).toString('hex')
  return `${prefix}${randomBytes}`
}

// Helper function to hash API key for storage
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

// Helper function to check organization access
async function checkOrganizationAccess(organizationId: string, userId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      members: {
        where: { userId, status: 'ACTIVE' },
        select: { role: true },
      },
    },
  })

  if (!organization) {
    return { hasAccess: false, userRole: null }
  }

  const isOwner = organization.ownerId === userId
  const member = organization.members[0]

  if (isOwner) {
    return { hasAccess: true, userRole: 'OWNER' }
  }

  if (!member) {
    return { hasAccess: false, userRole: null }
  }

  return { hasAccess: true, userRole: member.role }
}

// GET /api/api-keys - List user's API keys
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    // Build where clause for organizations the user has access to
    let whereClause: Record<string, unknown> = {
      organization: {
        OR: [
          { ownerId: session.user.id },
          {
            members: {
              some: {
                userId: session.user.id,
                status: 'ACTIVE',
              },
            },
          },
        ],
      },
    }

    if (organizationId) {
      // Check if user has access to this specific organization
      const { hasAccess } = await checkOrganizationAccess(organizationId, session.user.id)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      whereClause = {
        organizationId,
        organization: {
          OR: [
            { ownerId: session.user.id },
            {
              members: {
                some: {
                  userId: session.user.id,
                  status: 'ACTIVE',
                },
              },
            },
          ],
        },
      }
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        scopes: true,
        // Don't include the actual key hash for security
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Add status field
    const apiKeysWithStatus = apiKeys.map((key) => ({
      ...key,
      status: key.expiresAt && new Date(key.expiresAt) < new Date() ? 'expired' : 'active',
    }))

    return NextResponse.json({
      apiKeys: apiKeysWithStatus,
      total: apiKeysWithStatus.length,
    })
  } catch (error) {
    console.error('Error fetching API keys:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/api-keys - Create new API key
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createApiKeySchema.parse(body)

    // Check organization access
    const { hasAccess, userRole } = await checkOrganizationAccess(
      validatedData.organizationId,
      session.user.id
    )

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if user can create API keys (ADMIN or higher)
    const roleHierarchy = { VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4 }
    if ((roleHierarchy[userRole as keyof typeof roleHierarchy] || 0) < 3) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check API key limits
    const apiKeyCount = await prisma.apiKey.count({
      where: { organizationId: validatedData.organizationId },
    })

    // TODO: Check against subscription plan limits
    // For now, we'll allow up to 10 API keys per organization
    if (apiKeyCount >= 10) {
      return NextResponse.json({ error: 'API key limit reached for current plan' }, { status: 409 })
    }

    // Generate API key
    const apiKey = generateApiKey()
    const hashedKey = hashApiKey(apiKey)

    // Create API key record
    const newApiKey = await prisma.apiKey.create({
      data: {
        name: validatedData.name,
        keyHash: hashedKey,
        scopes: validatedData.scopes,
        organizationId: validatedData.organizationId,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        createdAt: true,
        expiresAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })

    return NextResponse.json(
      {
        apiKey: {
          ...newApiKey,
          key: apiKey, // Only returned once upon creation
          status: 'active',
        },
        message:
          'API key created successfully. Please save this key securely as it will not be shown again.',
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }

    console.error('Error creating API key:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
