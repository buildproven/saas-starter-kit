import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Input validation schemas
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  image: z.string().url().optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  website: z.string().url().optional(),
  preferences: z.object({
    emailNotifications: z.boolean().optional(),
    marketingEmails: z.boolean().optional(),
    securityAlerts: z.boolean().optional(),
    productUpdates: z.boolean().optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    timezone: z.string().optional(),
  }).optional(),
})

// GET /api/user/profile - Get current user's profile
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        bio: true,
        location: true,
        website: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
        emailVerified: true,
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

    // Get user's organizations
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
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        members: {
          where: { userId: session.user.id },
          select: { role: true, status: true },
        },
      },
    })

    // Transform organizations to include user's role
    const userOrganizations = organizations.map(org => ({
      ...org,
      userRole: org.ownerId === session.user.id ? 'OWNER' : org.members[0]?.role || 'VIEWER',
      members: undefined, // Remove the members array
    }))

    return NextResponse.json({
      user: {
        ...user,
        organizations: userOrganizations,
      },
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/user/profile - Update current user's profile
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = updateProfileSchema.parse(body)

    // Check if email is being changed and if it's already in use
    if (validatedData.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: validatedData.email,
          id: { not: session.user.id },
        },
      })

      if (existingUser) {
        return NextResponse.json(
          { error: 'Email address is already in use' },
          { status: 409 }
        )
      }
    }

    // Prepare update data
    const updateData: any = {}

    if (validatedData.name !== undefined) updateData.name = validatedData.name
    if (validatedData.email !== undefined) {
      updateData.email = validatedData.email
      updateData.emailVerified = null // Reset email verification when email changes
    }
    if (validatedData.image !== undefined) updateData.image = validatedData.image
    if (validatedData.bio !== undefined) updateData.bio = validatedData.bio
    if (validatedData.location !== undefined) updateData.location = validatedData.location
    if (validatedData.website !== undefined) updateData.website = validatedData.website

    // Handle preferences separately to merge with existing preferences
    if (validatedData.preferences) {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferences: true },
      })

      const currentPreferences = (currentUser?.preferences as any) || {}
      updateData.preferences = {
        ...currentPreferences,
        ...validatedData.preferences,
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        bio: true,
        location: true,
        website: true,
        preferences: true,
        updatedAt: true,
        emailVerified: true,
      },
    })

    return NextResponse.json({
      user: updatedUser,
      message: validatedData.email ? 'Profile updated. Please verify your new email address.' : 'Profile updated successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating user profile:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/user/profile - Delete current user's account
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user owns any organizations
    const ownedOrganizations = await prisma.organization.count({
      where: { ownerId: session.user.id },
    })

    if (ownedOrganizations > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete account while owning organizations. Please transfer ownership or delete organizations first.',
          ownedOrganizations,
        },
        { status: 409 }
      )
    }

    // Check for confirmation in request body
    const body = await request.json()
    if (!body.confirmDelete || body.confirmDelete !== true) {
      return NextResponse.json(
        { error: 'Account deletion requires explicit confirmation' },
        { status: 400 }
      )
    }

    // Remove user from all organization memberships
    await prisma.organizationMember.deleteMany({
      where: { userId: session.user.id },
    })

    // Delete user account (this will cascade to sessions, accounts, etc.)
    await prisma.user.delete({
      where: { id: session.user.id },
    })

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting user account:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}