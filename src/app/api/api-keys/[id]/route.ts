import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Input validation schemas
const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.string()).optional(),
})

interface RouteParams {
  params: {
    id: string
  }
}

// Helper function to check API key permissions
async function checkApiKeyPermission(apiKeyId: string, userId: string, requiredRole: 'OWNER' | 'ADMIN' = 'ADMIN') {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    include: {
      organization: {
        include: {
          members: {
            where: { userId, status: 'ACTIVE' },
            select: { role: true },
          },
        },
      },
    },
  })

  if (!apiKey) {
    return { apiKey: null, hasPermission: false, userRole: null }
  }

  const organization = apiKey.organization
  const isOwner = organization.ownerId === userId
  const member = organization.members[0]

  let userRole: string | null = null

  if (isOwner) {
    userRole = 'OWNER'
  } else if (member) {
    userRole = member.role
  } else {
    return { apiKey, hasPermission: false, userRole: null }
  }

  const roleHierarchy = { VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4 }
  const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0
  const requiredLevel = roleHierarchy[requiredRole] || 0

  return {
    apiKey,
    hasPermission: userLevel >= requiredLevel,
    userRole,
  }
}

// GET /api/api-keys/[id] - Get API key details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { apiKey, hasPermission } = await checkApiKeyPermission(
      params.id,
      session.user.id
    )

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Return API key details without the actual key hash
    const apiKeyDetails = {
      id: apiKey.id,
      name: apiKey.name,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
      scopes: apiKey.scopes,
      status: apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date() ? 'expired' : 'active',
      organization: {
        id: apiKey.organization.id,
        name: apiKey.organization.name,
        slug: apiKey.organization.slug,
      },
    }

    return NextResponse.json({
      apiKey: apiKeyDetails,
    })
  } catch (error) {
    console.error('Error fetching API key:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/api-keys/[id] - Update API key
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { apiKey, hasPermission } = await checkApiKeyPermission(
      params.id,
      session.user.id
    )

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if API key is expired
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'Cannot update expired API key' },
        { status: 409 }
      )
    }

    const body = await request.json()
    const validatedData = updateApiKeySchema.parse(body)

    const updatedApiKey = await prisma.apiKey.update({
      where: { id: params.id },
      data: validatedData,
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
        scopes: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })

    return NextResponse.json({
      apiKey: {
        ...updatedApiKey,
        status: updatedApiKey.expiresAt && new Date(updatedApiKey.expiresAt) < new Date() ? 'expired' : 'active',
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating API key:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/api-keys/[id] - Delete/revoke API key
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { apiKey, hasPermission } = await checkApiKeyPermission(
      params.id,
      session.user.id
    )

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.apiKey.delete({
      where: { id: params.id },
    })

    return NextResponse.json({
      success: true,
      message: 'API key revoked successfully',
    })
  } catch (error) {
    console.error('Error deleting API key:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}