import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { prisma } from '@/lib/prisma'
import { SubscriptionService } from '@/lib/subscription'
import { z } from 'zod'

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  organizationId: z.string(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
})

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

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit

    const whereClause: Record<string, unknown> = {
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
    const validatedData = createProjectSchema.parse(body)

    const { hasAccess, userRole } = await checkProjectAccess(validatedData.organizationId, user.id)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const roleHierarchy = { VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4 }
    if ((roleHierarchy[userRole as keyof typeof roleHierarchy] || 0) < 2) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

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
          },
        },
        { status: 402 }
      )
    }

    const project = await prisma.project.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
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
      },
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }

    console.error('Error creating project:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
