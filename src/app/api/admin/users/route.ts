import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth, type AuthenticatedUser } from '@/lib/auth/api-protection'

interface AuthContext {
  user: AuthenticatedUser | null
}

async function getUsersHandler(request: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  // This route requires ADMIN role or higher
  // TODO: Use user context for admin-specific filtering
  console.log('Admin user:', user?.id, 'accessing users endpoint')
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    // TODO: Implement search functionality in the future

    // TODO: Implement actual user fetching from database
    // const users = await getUsersWithPagination({ page, limit, search })

    // Mock data for now
    const mockUsers = [
      {
        id: '1',
        email: 'user1@example.com',
        name: 'John Doe',
        role: 'USER',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      },
      {
        id: '2',
        email: 'admin@example.com',
        name: 'Jane Admin',
        role: 'ADMIN',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      },
    ]

    return NextResponse.json({
      users: mockUsers,
      pagination: {
        page,
        limit,
        total: mockUsers.length,
        totalPages: Math.ceil(mockUsers.length / limit),
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
    if (!email || !name) {
      return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })
    }

    // Validate role
    const validRoles = ['USER', 'ADMIN', 'SUPER_ADMIN']
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

    // TODO: Create user in database
    // const newUser = await createUser({ email, name, role })

    const newUser = {
      id: Date.now().toString(),
      email,
      name,
      role,
      createdAt: new Date().toISOString(),
      lastLogin: null,
    }

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
