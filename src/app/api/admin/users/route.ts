import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth, type AuthenticatedUser } from '@/lib/auth/api-protection'
import { prisma } from '@/lib/prisma'
import { UserRole, Prisma } from '@prisma/client'

interface AuthContext {
  user: AuthenticatedUser | null
}

async function getUsersHandler(request: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  // This route requires ADMIN role or higher
  console.log('Admin user:', user?.id, 'accessing users endpoint')

  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const search = searchParams.get('search') || ''

    const skip = (page - 1) * limit

    // Build where clause for search
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}

    // Execute query and count in parallel
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          // Exclude sensitive fields if any
        },
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      message: 'Users retrieved successfully',
    })
  } catch (error) {
    console.error('Get users error:', error)
    return NextResponse.json({ error: 'Failed to retrieve users' }, { status: 500 })
  }
}

async function createUserHandler(
  request: NextRequest,
  { user }: AuthContext
): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { email, name, role = 'USER' } = body

    // Validate input
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Validate role
    const validRoles = Object.values(UserRole)
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 })
    }

    // Only SUPER_ADMIN can create ADMIN or SUPER_ADMIN users
    if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions to create admin users' },
        { status: 403 }
      )
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 })
    }

    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        role: role as UserRole,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      {
        user: newUser,
        message: 'User created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}

export const GET = withAdminAuth(getUsersHandler)
export const POST = withAdminAuth(createUserHandler)
