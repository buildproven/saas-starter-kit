import { NextRequest, NextResponse } from 'next/server'
import { withUserAuth, type AuthenticatedUser } from '@/lib/auth/api-protection'

interface AuthContext {
  user: AuthenticatedUser | null
}

async function getUserHandler(request: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  // This route is automatically protected and requires authentication
  // The user object is guaranteed to be non-null due to withUserAuth

  return NextResponse.json({
    user: {
      id: user?.id,
      email: user?.email,
      name: user?.name,
      role: user?.role,
    },
    message: 'User data retrieved successfully',
  })
}

async function updateUserHandler(
  request: NextRequest,
  { user }: AuthContext
): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { name } = body

    // Validate input
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Invalid name provided' }, { status: 400 })
    }

    // TODO: Update user in database
    // await updateUserProfile(user.id, { name })

    return NextResponse.json({
      user: {
        ...user,
        name,
      },
      message: 'User updated successfully',
    })
  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

// Apply auth protection to each HTTP method
export const GET = withUserAuth(getUserHandler)
export const PUT = withUserAuth(updateUserHandler)
