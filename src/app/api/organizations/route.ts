import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Input validation schemas
const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
})

// GET /api/organizations - List user's organizations
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organizations = await prisma.organization.findMany({
      where: {
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
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          where: {
            userId: session.user.id,
          },
          select: {
            role: true,
            status: true,
            joinedAt: true,
          },
        },
        subscription: {
          select: {
            status: true,
            currentPeriodEnd: true,
            plan: {
              select: {
                name: true,
                features: true,
              },
            },
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
      orderBy: {
        updatedAt: 'desc',
      },
    })

    // Transform the data to include user's role
    const transformedOrganizations = organizations.map((org) => ({
      ...org,
      userRole: org.ownerId === session.user.id ? 'OWNER' : org.members[0]?.role || 'VIEWER',
      userStatus: org.ownerId === session.user.id ? 'ACTIVE' : org.members[0]?.status || 'PENDING',
      members: undefined, // Remove the filtered members array
    }))

    return NextResponse.json({
      organizations: transformedOrganizations,
      total: transformedOrganizations.length,
    })
  } catch (error) {
    console.error('Error fetching organizations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/organizations - Create new organization
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createOrganizationSchema.parse(body)

    // Check if slug is already taken
    const existingOrg = await prisma.organization.findUnique({
      where: { slug: validatedData.slug },
    })

    if (existingOrg) {
      return NextResponse.json(
        { error: 'Organization slug already exists' },
        { status: 409 }
      )
    }

    // Create organization with owner
    const organization = await prisma.organization.create({
      data: {
        name: validatedData.name,
        slug: validatedData.slug,
        description: validatedData.description,
        ownerId: session.user.id,
      },
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
      organization: {
        ...organization,
        userRole: 'OWNER',
        userStatus: 'ACTIVE',
      },
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating organization:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}