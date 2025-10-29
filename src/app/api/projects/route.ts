import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SubscriptionService } from '@/lib/subscription'
import { z } from 'zod'

// Input validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  organizationId: z.string(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
})

// Helper function to check project permissions
async function checkProjectAccess(organizationId: string, userId: string) {
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

// GET /api/projects - List user's projects
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit

    // Build where clause
    const whereClause: any = {
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
      whereClause.organizationId = organizationId
    }

    if (status) {
      whereClause.status = status
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: whereClause,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              tasks: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      prisma.project.count({ where: whereClause }),
    ])

    return NextResponse.json({
      projects,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createProjectSchema.parse(body)

    // Check organization access
    const { hasAccess, userRole } = await checkProjectAccess(
      validatedData.organizationId,
      session.user.id
    )

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if user can create projects (MEMBER or higher)
    const roleHierarchy = { VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4 }
    if ((roleHierarchy[userRole as keyof typeof roleHierarchy] || 0) < 2) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check subscription limits for project creation
    const projectCount = await prisma.project.count({
      where: { organizationId: validatedData.organizationId },
    })

    const canCreateProject = await SubscriptionService.canPerformAction(
      validatedData.organizationId,
      'maxProjects',
      projectCount
    )

    if (!canCreateProject) {
      const features = await SubscriptionService.getPlanFeatures(validatedData.organizationId)
      return NextResponse.json(
        {
          error: 'Project limit reached for current plan',
          details: {
            current: projectCount,
            limit: features.maxProjects === -1 ? 'unlimited' : features.maxProjects,
            upgradeRequired: true,
          }
        },
        { status: 402 } // Payment Required
      )
    }

    const project = await prisma.project.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        status: validatedData.status,
        organizationId: validatedData.organizationId,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    })

    return NextResponse.json({
      project,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating project:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}