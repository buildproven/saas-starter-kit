import { render, screen } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { ProtectedRoute } from '../ProtectedRoute'

// Mock next-auth
jest.mock('next-auth/react')
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}))

beforeEach(() => {
  mockPush.mockClear()
})

describe('ProtectedRoute', () => {
  it('should render children when user is authenticated with sufficient role', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: '1',
          email: 'user@example.com',
          role: 'ADMIN',
        },
      },
      status: 'authenticated',
    })

    render(
      <ProtectedRoute requiredRole="USER">
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('should show loading state when session is loading', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'loading',
    })

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should redirect to signin when user is not authenticated', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    })

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(mockPush).toHaveBeenCalledWith('/auth/signin')
  })

  it('should redirect to unauthorized when user lacks required role', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: '1',
          email: 'user@example.com',
          role: 'USER',
        },
      },
      status: 'authenticated',
    })

    render(
      <ProtectedRoute requiredRole="ADMIN">
        <div>Admin Content</div>
      </ProtectedRoute>
    )

    expect(mockPush).toHaveBeenCalledWith('/unauthorized')
  })

  it('should render fallback when provided and user lacks access', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    })

    render(
      <ProtectedRoute fallback={<div>Please sign in</div>}>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Please sign in')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('should allow super admin to access admin routes', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: '1',
          email: 'superadmin@example.com',
          role: 'SUPER_ADMIN',
        },
      },
      status: 'authenticated',
    })

    render(
      <ProtectedRoute requiredRole="ADMIN">
        <div>Admin Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Admin Content')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('should use custom redirect path when provided', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    })

    render(
      <ProtectedRoute redirectTo="/custom-signin">
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(mockPush).toHaveBeenCalledWith('/custom-signin')
  })
})
