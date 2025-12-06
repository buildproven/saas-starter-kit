import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import crypto from 'crypto'

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  organizationId: z.string(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).default(['read']),
})

function generateApiKey(): string {
  const prefix = 'sk_'
  const randomBytes = crypto.randomBytes(32).toString('hex')
  return `${prefix}${randomBytes}`
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

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

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    let whereClause: Record<string, unknown> = {
      organization: {
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                userId: user.id,
                status: 'ACTIVE',
              },
            },
          },
        ],
      },
    }

    if (organizationId) {
      const { hasAccess } = await checkOrganizationAccess(organizationId, user.id)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      whereClause = {
        organizationId,
        organization: {
          OR: [
            { ownerId: user.id },
            {
              members: {
                some: {
                  userId: user.id,
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

export async function POST(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createApiKeySchema.parse(body)

    const { hasAccess, userRole } = await checkOrganizationAccess(
      validatedData.organizationId,
      user.id
    )

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const roleHierarchy = { VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4 }
    if ((roleHierarchy[userRole as keyof typeof roleHierarchy] || 0) < 3) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const apiKeyCount = await prisma.apiKey.count({
      where: { organizationId: validatedData.organizationId },
    })

    if (apiKeyCount >= 10) {
      return NextResponse.json({ error: 'API key limit reached for current plan' }, { status: 409 })
    }

    const apiKey = generateApiKey()
    const hashedKey = hashApiKey(apiKey)

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
          key: apiKey,
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
