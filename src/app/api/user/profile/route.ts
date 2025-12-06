import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  image: z.string().url().optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  website: z.string().url().optional(),
  preferences: z
    .object({
      emailNotifications: z.boolean().optional(),
      marketingEmails: z.boolean().optional(),
      securityAlerts: z.boolean().optional(),
      productUpdates: z.boolean().optional(),
      theme: z.enum(['light', 'dark', 'system']).optional(),
      timezone: z.string().optional(),
    })
    .optional(),
})

export async function GET() {
  try {
    const authUser = await getUser()
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = authUser.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            ownedOrganizations: true,
            organizationMemberships: {
              where: {
                status: 'ACTIVE',
              },
            },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const organizations = await prisma.organization.findMany({
      where: {
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                userId: userId,
                status: 'ACTIVE',
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        members: {
          where: { userId: userId },
          select: { role: true, status: true },
        },
      },
    })

    const userOrganizations = organizations.map((org) => ({
      ...org,
      userRole: org.ownerId === userId ? 'OWNER' : org.members[0]?.role || 'VIEWER',
      members: undefined,
    }))

    return NextResponse.json({
      user: {
        ...user,
        organizations: userOrganizations,
      },
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authUser = await getUser()
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = updateProfileSchema.parse(body)

    if (validatedData.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: validatedData.email,
          id: { not: authUser.id },
        },
      })

      if (existingUser) {
        return NextResponse.json({ error: 'Email address is already in use' }, { status: 409 })
      }
    }

    const updateData: {
      name?: string
      email?: string
      image?: string | null
    } = {}

    if (validatedData.name !== undefined) updateData.name = validatedData.name
    if (validatedData.email !== undefined) updateData.email = validatedData.email
    if (validatedData.image !== undefined) updateData.image = validatedData.image

    const updatedUser = await prisma.user.update({
      where: { id: authUser.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      user: updatedUser,
      message: validatedData.email
        ? 'Profile updated. Please verify your new email address.'
        : 'Profile updated successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }

    console.error('Error updating user profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getUser()
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ownedOrganizations = await prisma.organization.count({
      where: { ownerId: authUser.id },
    })

    if (ownedOrganizations > 0) {
      return NextResponse.json(
        {
          error:
            'Cannot delete account while owning organizations. Please transfer ownership or delete organizations first.',
          ownedOrganizations,
        },
        { status: 409 }
      )
    }

    const body = await request.json()
    if (!body.confirmDelete || body.confirmDelete !== true) {
      return NextResponse.json(
        { error: 'Account deletion requires explicit confirmation' },
        { status: 400 }
      )
    }

    await prisma.organizationMember.deleteMany({
      where: { userId: authUser.id },
    })

    await prisma.user.delete({
      where: { id: authUser.id },
    })

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting user account:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
