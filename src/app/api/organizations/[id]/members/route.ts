import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Input validation schemas
const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['VIEWER', 'MEMBER', 'ADMIN']).default('MEMBER'),
})

const updateMemberSchema = z.object({
  role: z.enum(['VIEWER', 'MEMBER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
})

interface RouteParams {
  params: {
    id: string
  }
}

// Helper function to check organization permissions
async function checkOrganizationPermission(organizationId: string, userId: string, requiredRole: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER') {
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

// GET /api/organizations/[id]/members - List organization members
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { organization, hasPermission } = await checkOrganizationPermission(
      params.id,
      session.user.id,
      'MEMBER'
    )

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: params.id },
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
    })

    // Include owner in the list
    const owner = await prisma.user.findUnique({
      where: { id: organization.ownerId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    })

    const allMembers = [
      {
        id: 'owner',
        role: 'OWNER',
        status: 'ACTIVE',
        joinedAt: organization.createdAt,
        user: owner,
      },
      ...members,
    ]

    return NextResponse.json({
      members: allMembers,
      total: allMembers.length,
    })
  } catch (error) {
    console.error('Error fetching organization members:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/organizations/[id]/members - Invite new member
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { organization, hasPermission } = await checkOrganizationPermission(
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
    const validatedData = inviteMemberSchema.parse(body)

    // Check if user exists
    const inviteeUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    })

    if (!inviteeUser) {
      return NextResponse.json(
        { error: 'User with this email does not exist' },
        { status: 404 }
      )
    }

    // Check if user is already a member or owner
    if (inviteeUser.id === organization.ownerId) {
      return NextResponse.json(
        { error: 'User is already the owner of this organization' },
        { status: 409 }
      )
    }

    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: inviteeUser.id,
          organizationId: params.id,
        },
      },
    })

    if (existingMember) {
      return NextResponse.json(
        { error: 'User is already a member of this organization' },
        { status: 409 }
      )
    }

    // Check subscription limits
    const memberCount = await prisma.organizationMember.count({
      where: { organizationId: params.id, status: 'ACTIVE' },
    })

    // TODO: Check against subscription plan limits
    // For now, we'll allow up to 10 members
    if (memberCount >= 10) {
      return NextResponse.json(
        { error: 'Member limit reached for current plan' },
        { status: 409 }
      )
    }

    // Create membership
    const newMember = await prisma.organizationMember.create({
      data: {
        userId: inviteeUser.id,
        organizationId: params.id,
        role: validatedData.role,
        status: 'PENDING', // User needs to accept invitation
      },
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
    })

    // TODO: Send invitation email
    console.log(`Invitation sent to ${validatedData.email} for organization ${organization.name}`)

    return NextResponse.json({
      member: newMember,
      message: 'Invitation sent successfully',
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error inviting member:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}