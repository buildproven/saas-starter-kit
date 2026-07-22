import { render, screen } from '@testing-library/react'
import { useAuth } from '@/lib/hooks/useAuth'
import { AdminOnly, AuthenticatedOnly, RoleGate, SuperAdminOnly } from '../RoleGate'

vi.mock('@/lib/hooks/useAuth', () => ({ useAuth: vi.fn() }))

type AuthState = ReturnType<typeof useAuth>
type Role = AuthState['role']

function authState(role: Role): AuthState {
  const levels = { USER: 1, ADMIN: 2, SUPER_ADMIN: 3 }
  const user = role ? { id: 'user-1', email: 'user@example.com', name: 'Test User', role } : null

  return {
    user,
    isAuthenticated: Boolean(user),
    isLoading: false,
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

describe('RoleGate', () => {
  it('renders children for an allowed role', () => {
    mockUseAuth.mockReturnValue(authState('ADMIN'))

    render(
      <RoleGate allowedRoles={['ADMIN']}>
        <div>Admin content</div>
      </RoleGate>
    )

    expect(screen.getByText('Admin content')).toBeInTheDocument()
  })

  it('lets a higher role access lower-role content', () => {
    mockUseAuth.mockReturnValue(authState('SUPER_ADMIN'))

    render(
      <RoleGate allowedRoles={['USER']}>
        <div>Member content</div>
      </RoleGate>
    )

    expect(screen.getByText('Member content')).toBeInTheDocument()
  })

  it('renders its fallback for anonymous and insufficiently privileged visitors', () => {
    mockUseAuth.mockReturnValue(authState(null))
    const { rerender } = render(
      <RoleGate allowedRoles={['ADMIN']} fallback={<div>Denied</div>}>
        <div>Admin content</div>
      </RoleGate>
    )
    expect(screen.getByText('Denied')).toBeInTheDocument()

    mockUseAuth.mockReturnValue(authState('USER'))
    rerender(
      <RoleGate allowedRoles={['ADMIN']} fallback={<div>Denied</div>}>
        <div>Admin content</div>
      </RoleGate>
    )
    expect(screen.getByText('Denied')).toBeInTheDocument()
  })

  it('honors requireAll using the role hierarchy', () => {
    mockUseAuth.mockReturnValue(authState('SUPER_ADMIN'))

    render(
      <RoleGate allowedRoles={['USER', 'ADMIN']} requireAll>
        <div>Privileged content</div>
      </RoleGate>
    )

    expect(screen.getByText('Privileged content')).toBeInTheDocument()
  })

  it('provides convenience gates for common access levels', () => {
    mockUseAuth.mockReturnValue(authState('SUPER_ADMIN'))
    render(
      <>
        <AuthenticatedOnly>
          <div>Signed in</div>
        </AuthenticatedOnly>
        <AdminOnly>
          <div>Admin only</div>
        </AdminOnly>
        <SuperAdminOnly>
          <div>Super admin only</div>
        </SuperAdminOnly>
      </>
    )

    expect(screen.getByText('Signed in')).toBeInTheDocument()
    expect(screen.getByText('Admin only')).toBeInTheDocument()
    expect(screen.getByText('Super admin only')).toBeInTheDocument()
  })
})
