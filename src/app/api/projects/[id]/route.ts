import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Input validation schemas
const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
})

interface RouteParams {
  params: {
    id: string
  }
}

// Helper function to check project permissions
async function checkProjectPermission(projectId: string, userId: string, requiredRole: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER') {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
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

  if (!project) {
    return { project: null, hasPermission: false, userRole: null }
  }

  const organization = project.organization
  const isOwner = organization.ownerId === userId
  const member = organization.members[0]

  let userRole: string | null = null

  if (isOwner) {
    userRole = 'OWNER'
  } else if (member) {
    userRole = member.role
  } else {
    return { project, hasPermission: false, userRole: null }
  }

  const roleHierarchy = { VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4 }
  const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0
  const requiredLevel = roleHierarchy[requiredRole] || 0

  return {
    project,
    hasPermission: userLevel >= requiredLevel,
    userRole,
  }
}

// GET /api/projects/[id] - Get project details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { project, hasPermission, userRole } = await checkProjectPermission(
      params.id,
      session.user.id
    )

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get detailed project info
    const detailedProject = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            updatedAt: true,
            assigneeId: true,
          },
          orderBy: {
            updatedAt: 'desc',
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
      project: {
        ...detailedProject,
        userRole,
      },
    })
  } catch (error) {
    console.error('Error fetching project:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/projects/[id] - Update project
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { project, hasPermission } = await checkProjectPermission(
      params.id,
      session.user.id,
      'MEMBER'
    )

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = updateProjectSchema.parse(body)

    const updatedProject = await prisma.project.update({
      where: { id: params.id },
      data: validatedData,
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
      project: updatedProject,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating project:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { project, hasPermission } = await checkProjectPermission(
      params.id,
      session.user.id,
      'ADMIN'
    )

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if project has tasks
    const taskCount = await prisma.task.count({
      where: { projectId: params.id },
    })

    if (taskCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete project with existing tasks' },
        { status: 409 }
      )
    }

    await prisma.project.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}