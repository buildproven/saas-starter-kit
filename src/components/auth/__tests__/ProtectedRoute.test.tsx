import { render, screen } from '@testing-library/react'
import type { Session } from 'next-auth'
import { useSession } from 'next-auth/react'
import { ProtectedRoute } from '../ProtectedRoute'

// Mock next-auth
jest.mock('next-auth/react')
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>
const authenticatedSession = (overrides: Partial<Session['user']> = {}): Session => ({
  user: {
    id: '1',
    email: 'user@example.com',
    name: 'Test User',
    role: 'USER',
    ...overrides,
  },
  expires: '2025-01-01T00:00:00.000Z',
})

const withStatus = <TStatus extends ReturnType<typeof useSession>['status']>(
  status: TStatus,
  session: TStatus extends 'authenticated' ? Session : null
) => ({
  data: session,
  status,
  update: jest.fn(),
})

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
    mockUseSession.mockReturnValue(
      withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
    )

    render(
      <ProtectedRoute requiredRole="USER">
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('should show loading state when session is loading', () => {
    mockUseSession.mockReturnValue(withStatus('loading', null))

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should redirect to signin when user is not authenticated', () => {
    mockUseSession.mockReturnValue(withStatus('unauthenticated', null))

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(mockPush).toHaveBeenCalledWith('/auth/signin')
  })

  it('should redirect to unauthorized when user lacks required role', () => {
    mockUseSession.mockReturnValue(withStatus('authenticated', authenticatedSession()))

    render(
      <ProtectedRoute requiredRole="ADMIN">
        <div>Admin Content</div>
      </ProtectedRoute>
    )

    expect(mockPush).toHaveBeenCalledWith('/unauthorized')
  })

  it('should render fallback when provided and user lacks access', () => {
    mockUseSession.mockReturnValue(withStatus('unauthenticated', null))

    render(
      <ProtectedRoute fallback={<div>Please sign in</div>}>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Please sign in')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('should allow super admin to access admin routes', () => {
    mockUseSession.mockReturnValue(
      withStatus('authenticated', authenticatedSession({ email: 'superadmin@example.com', role: 'SUPER_ADMIN', name: 'Super Admin' }))
    )

    render(
      <ProtectedRoute requiredRole="ADMIN">
        <div>Admin Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Admin Content')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('should use custom redirect path when provided', () => {
    mockUseSession.mockReturnValue(withStatus('unauthenticated', null))

    render(
      <ProtectedRoute redirectTo="/custom-signin">
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(mockPush).toHaveBeenCalledWith('/custom-signin')
  })
})
