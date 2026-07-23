import { render, screen } from '@testing-library/react'
import { useAuth } from '@/lib/hooks/useAuth'
import { ProtectedRoute } from '../ProtectedRoute'

vi.mock('@/lib/hooks/useAuth', () => ({ useAuth: vi.fn() }))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

type AuthState = ReturnType<typeof useAuth>
type Role = AuthState['role']

function authState(role: Role, isLoading = false): AuthState {
  const levels = { USER: 1, ADMIN: 2, SUPER_ADMIN: 3 }
  const user = role ? { id: 'user-1', email: 'user@example.com', name: 'Test User', role } : null

  return {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    role,
    hasRole: (requiredRole) => role === requiredRole,
    hasAnyRole: (roles) => role !== null && roles.includes(role),
    hasAllRoles: (roles) => role !== null && roles.every((requiredRole) => role === requiredRole),
    isAdmin: role !== null && levels[role] >= levels.ADMIN,
    isSuperAdmin: role === 'SUPER_ADMIN',
    canAccess: (requiredRole) => role !== null && levels[role] >= levels[requiredRole],
  }
}

const mockUseAuth = vi.mocked(useAuth)

beforeEach(() => {
  mockPush.mockClear()
})

describe('ProtectedRoute', () => {
  it('renders children when the signed-in user meets the required role', () => {
    mockUseAuth.mockReturnValue(authState('ADMIN'))

    render(
      <ProtectedRoute requiredRole="USER">
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('renders its loading state while authentication is resolving', () => {
    mockUseAuth.mockReturnValue(authState(null, true))

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('redirects an anonymous visitor to the configured sign-in page', () => {
    mockUseAuth.mockReturnValue(authState(null))

    render(
      <ProtectedRoute redirectTo="/custom-signin">
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(mockPush).toHaveBeenCalledWith('/custom-signin')
  })

  it('redirects a signed-in user without the required role to unauthorized', () => {
    mockUseAuth.mockReturnValue(authState('USER'))

    render(
      <ProtectedRoute requiredRole="ADMIN">
        <div>Admin Content</div>
      </ProtectedRoute>
    )

    expect(mockPush).toHaveBeenCalledWith('/unauthorized')
  })

  it('uses the supplied fallback while access is denied', () => {
    mockUseAuth.mockReturnValue(authState(null))

    render(
      <ProtectedRoute fallback={<div>Please sign in</div>}>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Please sign in')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })
})
