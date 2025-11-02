import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Input validation schemas
const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().optional(),
})

interface RouteParams {
  params: {
    id: string
  }
}

// Helper function to check user permissions
async function checkUserPermission(
  organizationId: string,
  userId: string,
  requiredRole: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER'
) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      members: {
        where: { userId },
        select: { role: true, status: true },
      },
    },
  })

  if (!organization) {
    return { organization: null, hasPermission: false, userRole: null }
  }

  const isOwner = organization.ownerId === userId
  const member = organization.members[0]

  if (isOwner) {
    return { organization, hasPermission: true, userRole: 'OWNER' }
  }

  if (!member || member.status !== 'ACTIVE') {
    return { organization, hasPermission: false, userRole: null }
  }

  const roleHierarchy = { VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4 }
  const userLevel = roleHierarchy[member.role] || 0
  const requiredLevel = roleHierarchy[requiredRole] || 0

  return {
    organization,
    hasPermission: userLevel >= requiredLevel,
    userRole: member.role,
  }
}

// GET /api/organizations/[id] - Get organization details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { organization, hasPermission, userRole } = await checkUserPermission(
      params.id,
      session.user.id
    )

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get detailed organization info
    const detailedOrg = await prisma.organization.findUnique({
      where: { id: params.id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
          orderBy: {
            joinedAt: 'asc',
          },
        },
        subscription: {
          include: {
            plan: {
              select: {
                name: true,
                features: true,
              },
            },
          },
        },
        projects: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        },
        apiKeys: {
          select: {
            id: true,
            name: true,
            lastUsedAt: true,
            createdAt: true,
            expiresAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            members: true,
            projects: true,
            apiKeys: true,
          },
        },
      },
    })

    return NextResponse.json({
      organization: {
        ...detailedOrg,
        userRole,
      },
    })
  } catch (error) {
    console.error('Error fetching organization:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/organizations/[id] - Update organization
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { organization, hasPermission } = await checkUserPermission(
      params.id,
      session.user.id,
      'ADMIN'
    )

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = updateOrganizationSchema.parse(body)

    // Check slug uniqueness if being updated
    if (validatedData.slug && validatedData.slug !== organization.slug) {
      const existingOrg = await prisma.organization.findUnique({
        where: { slug: validatedData.slug },
      })

      if (existingOrg) {
        return NextResponse.json({ error: 'Organization slug already exists' }, { status: 409 })
      }
    }

    const updatedOrganization = await prisma.organization.update({
      where: { id: params.id },
      data: validatedData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            members: true,
            projects: true,
            apiKeys: true,
          },
        },
      },
    })

    return NextResponse.json({
      organization: updatedOrganization,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }

    console.error('Error updating organization:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/organizations/[id] - Delete organization
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organization = await prisma.organization.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            members: true,
            projects: true,
            apiKeys: true,
          },
        },
      },
    })

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Only owner can delete organization
    if (organization.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if organization has dependent data
    if (organization._count.projects > 0) {
      return NextResponse.json(
        { error: 'Cannot delete organization with existing projects' },
        { status: 409 }
      )
    }

    await prisma.organization.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting organization:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
