import { render, screen } from '@testing-library/react'
import type { Session } from 'next-auth'
import { useSession } from 'next-auth/react'
import { RoleGate, AdminOnly, SuperAdminOnly, AuthenticatedOnly } from '../RoleGate'

vi.mock('next-auth/react')
const mockUseSession = useSession as vi.MockedFunction<typeof useSession>

interface TestUser extends Record<string, unknown> {
  id: string
  email: string
  name: string
  role: string
}

const authenticatedSession = (overrides: Partial<TestUser> = {}): Session => ({
  user: {
    id: '1',
    email: 'user@example.com',
    name: 'Test User',
    role: 'USER',
    ...overrides,
  } as TestUser,
  expires: '2025-01-01T00:00:00.000Z',
})

const withStatus = <TStatus extends ReturnType<typeof useSession>['status']>(
  status: TStatus,
  session: TStatus extends 'authenticated' ? Session : null
) => ({
  data: session,
  status,
  update: vi.fn(),
})

describe('RoleGate', () => {
  describe('Basic rendering with required role', () => {
    it('should render children when user has exact required role', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'USER' }))
      )

      render(
        <RoleGate allowedRoles={['USER']}>
          <div>User Content</div>
        </RoleGate>
      )

      expect(screen.getByText('User Content')).toBeInTheDocument()
    })

    it('should render children when user has higher role than required', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
      )

      render(
        <RoleGate allowedRoles={['USER']}>
          <div>User Content</div>
        </RoleGate>
      )

      expect(screen.getByText('User Content')).toBeInTheDocument()
    })

    it('should render children when super admin accesses admin content', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'SUPER_ADMIN' }))
      )

      render(
        <RoleGate allowedRoles={['ADMIN']}>
          <div>Admin Content</div>
        </RoleGate>
      )

      expect(screen.getByText('Admin Content')).toBeInTheDocument()
    })

    it('should not render children when user lacks required role', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'USER' }))
      )

      render(
        <RoleGate allowedRoles={['ADMIN']}>
          <div>Admin Content</div>
        </RoleGate>
      )

      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
    })
  })

  describe('Multiple allowed roles (OR logic)', () => {
    it('should render children when user has one of multiple allowed roles', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
      )

      render(
        <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
          <div>Admin or Super Admin Content</div>
        </RoleGate>
      )

      expect(screen.getByText('Admin or Super Admin Content')).toBeInTheDocument()
    })

    it('should render children when user has higher role than any allowed role', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'SUPER_ADMIN' }))
      )

      render(
        <RoleGate allowedRoles={['USER', 'ADMIN']}>
          <div>Multiple Roles Content</div>
        </RoleGate>
      )

      expect(screen.getByText('Multiple Roles Content')).toBeInTheDocument()
    })

    it('should not render children when user lacks all allowed roles', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'USER' }))
      )

      render(
        <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
          <div>Admin Content</div>
        </RoleGate>
      )

      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
    })
  })

  describe('RequireAll mode (AND logic)', () => {
    it('should render when super admin satisfies all role requirements', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'SUPER_ADMIN' }))
      )

      render(
        <RoleGate allowedRoles={['USER', 'ADMIN']} requireAll>
          <div>All Roles Required</div>
        </RoleGate>
      )

      expect(screen.getByText('All Roles Required')).toBeInTheDocument()
    })

    it('should not render when user only has some of required roles', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
      )

      render(
        <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN']} requireAll>
          <div>All Roles Required</div>
        </RoleGate>
      )

      expect(screen.queryByText('All Roles Required')).not.toBeInTheDocument()
    })

    it('should render when user exactly matches single required role with requireAll', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
      )

      render(
        <RoleGate allowedRoles={['ADMIN']} requireAll>
          <div>Single Role With RequireAll</div>
        </RoleGate>
      )

      expect(screen.getByText('Single Role With RequireAll')).toBeInTheDocument()
    })
  })

  describe('Fallback rendering', () => {
    it('should render fallback when user lacks required role', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'USER' }))
      )

      render(
        <RoleGate allowedRoles={['ADMIN']} fallback={<div>Access Denied</div>}>
          <div>Admin Content</div>
        </RoleGate>
      )

      expect(screen.getByText('Access Denied')).toBeInTheDocument()
      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
    })

    it('should render fallback when user is not authenticated', () => {
      mockUseSession.mockReturnValue(withStatus('unauthenticated', null))

      render(
        <RoleGate allowedRoles={['USER']} fallback={<div>Please sign in</div>}>
          <div>Protected Content</div>
        </RoleGate>
      )

      expect(screen.getByText('Please sign in')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('should render null when no fallback provided and access denied', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'USER' }))
      )

      const { container } = render(
        <RoleGate allowedRoles={['ADMIN']}>
          <div>Admin Content</div>
        </RoleGate>
      )

      expect(container.textContent).toBe('')
    })

    it('should render custom fallback component', () => {
      mockUseSession.mockReturnValue(withStatus('unauthenticated', null))

      render(
        <RoleGate
          allowedRoles={['ADMIN']}
          fallback={
            <div>
              <h1>Unauthorized</h1>
              <p>You need admin access</p>
            </div>
          }
        >
          <div>Admin Content</div>
        </RoleGate>
      )

      expect(screen.getByText('Unauthorized')).toBeInTheDocument()
      expect(screen.getByText('You need admin access')).toBeInTheDocument()
    })
  })

  describe('Unauthenticated state', () => {
    it('should render fallback when session is null', () => {
      mockUseSession.mockReturnValue(withStatus('unauthenticated', null))

      render(
        <RoleGate allowedRoles={['USER']} fallback={<div>Not authenticated</div>}>
          <div>User Content</div>
        </RoleGate>
      )

      expect(screen.getByText('Not authenticated')).toBeInTheDocument()
      expect(screen.queryByText('User Content')).not.toBeInTheDocument()
    })

    it('should render null when not authenticated and no fallback', () => {
      mockUseSession.mockReturnValue(withStatus('unauthenticated', null))

      const { container } = render(
        <RoleGate allowedRoles={['USER']}>
          <div>User Content</div>
        </RoleGate>
      )

      expect(container.textContent).toBe('')
    })
  })

  describe('Role hierarchy', () => {
    it('should respect role hierarchy: SUPER_ADMIN > ADMIN > USER', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'SUPER_ADMIN' }))
      )

      render(
        <RoleGate allowedRoles={['USER']}>
          <div>Any Authenticated User</div>
        </RoleGate>
      )

      expect(screen.getByText('Any Authenticated User')).toBeInTheDocument()
    })

    it('should prevent USER from accessing ADMIN content', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'USER' }))
      )

      render(
        <RoleGate allowedRoles={['ADMIN']}>
          <div>Admin Only</div>
        </RoleGate>
      )

      expect(screen.queryByText('Admin Only')).not.toBeInTheDocument()
    })

    it('should prevent ADMIN from accessing SUPER_ADMIN content', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
      )

      render(
        <RoleGate allowedRoles={['SUPER_ADMIN']}>
          <div>Super Admin Only</div>
        </RoleGate>
      )

      expect(screen.queryByText('Super Admin Only')).not.toBeInTheDocument()
    })
  })

  describe('Edge cases', () => {
    it('should handle missing role in session (defaults to USER)', () => {
      const sessionWithoutRole = {
        user: {
          id: '1',
          email: 'user@example.com',
          name: 'Test User',
        },
        expires: '2025-01-01T00:00:00.000Z',
      } as Session

      mockUseSession.mockReturnValue(withStatus('authenticated', sessionWithoutRole))

      render(
        <RoleGate allowedRoles={['USER']}>
          <div>User Content</div>
        </RoleGate>
      )

      expect(screen.getByText('User Content')).toBeInTheDocument()
    })

    it('should handle unknown role gracefully', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'UNKNOWN_ROLE' }))
      )

      render(
        <RoleGate allowedRoles={['USER']}>
          <div>User Content</div>
        </RoleGate>
      )

      expect(screen.queryByText('User Content')).not.toBeInTheDocument()
    })

    it('should handle empty allowedRoles array', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
      )

      render(
        <RoleGate allowedRoles={[]}>
          <div>Content</div>
        </RoleGate>
      )

      expect(screen.queryByText('Content')).not.toBeInTheDocument()
    })
  })

  describe('Convenience components', () => {
    describe('AdminOnly', () => {
      it('should render children for admin users', () => {
        mockUseSession.mockReturnValue(
          withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
        )

        render(
          <AdminOnly>
            <div>Admin Content</div>
          </AdminOnly>
        )

        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })

      it('should render children for super admin users', () => {
        mockUseSession.mockReturnValue(
          withStatus('authenticated', authenticatedSession({ role: 'SUPER_ADMIN' }))
        )

        render(
          <AdminOnly>
            <div>Admin Content</div>
          </AdminOnly>
        )

        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })

      it('should not render children for regular users', () => {
        mockUseSession.mockReturnValue(
          withStatus('authenticated', authenticatedSession({ role: 'USER' }))
        )

        render(
          <AdminOnly>
            <div>Admin Content</div>
          </AdminOnly>
        )

        expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
      })

      it('should render fallback when user is not admin', () => {
        mockUseSession.mockReturnValue(
          withStatus('authenticated', authenticatedSession({ role: 'USER' }))
        )

        render(
          <AdminOnly fallback={<div>Admin Only Area</div>}>
            <div>Admin Content</div>
          </AdminOnly>
        )

        expect(screen.getByText('Admin Only Area')).toBeInTheDocument()
      })
    })

    describe('SuperAdminOnly', () => {
      it('should render children for super admin users', () => {
        mockUseSession.mockReturnValue(
          withStatus('authenticated', authenticatedSession({ role: 'SUPER_ADMIN' }))
        )

        render(
          <SuperAdminOnly>
            <div>Super Admin Content</div>
          </SuperAdminOnly>
        )

        expect(screen.getByText('Super Admin Content')).toBeInTheDocument()
      })

      it('should not render children for admin users', () => {
        mockUseSession.mockReturnValue(
          withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
        )

        render(
          <SuperAdminOnly>
            <div>Super Admin Content</div>
          </SuperAdminOnly>
        )

        expect(screen.queryByText('Super Admin Content')).not.toBeInTheDocument()
      })

      it('should not render children for regular users', () => {
        mockUseSession.mockReturnValue(
          withStatus('authenticated', authenticatedSession({ role: 'USER' }))
        )

        render(
          <SuperAdminOnly>
            <div>Super Admin Content</div>
          </SuperAdminOnly>
        )

        expect(screen.queryByText('Super Admin Content')).not.toBeInTheDocument()
      })

      it('should render fallback when user is not super admin', () => {
        mockUseSession.mockReturnValue(
          withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
        )

        render(
          <SuperAdminOnly fallback={<div>Super Admin Only</div>}>
            <div>Super Admin Content</div>
          </SuperAdminOnly>
        )

        expect(screen.getByText('Super Admin Only')).toBeInTheDocument()
      })
    })

    describe('AuthenticatedOnly', () => {
      it('should render children for authenticated users', () => {
        mockUseSession.mockReturnValue(
          withStatus('authenticated', authenticatedSession({ role: 'USER' }))
        )

        render(
          <AuthenticatedOnly>
            <div>Authenticated Content</div>
          </AuthenticatedOnly>
        )

        expect(screen.getByText('Authenticated Content')).toBeInTheDocument()
      })

      it('should render children for admin users', () => {
        mockUseSession.mockReturnValue(
          withStatus('authenticated', authenticatedSession({ role: 'ADMIN' }))
        )

        render(
          <AuthenticatedOnly>
            <div>Authenticated Content</div>
          </AuthenticatedOnly>
        )

        expect(screen.getByText('Authenticated Content')).toBeInTheDocument()
      })

      it('should not render children for unauthenticated users', () => {
        mockUseSession.mockReturnValue(withStatus('unauthenticated', null))

        render(
          <AuthenticatedOnly>
            <div>Authenticated Content</div>
          </AuthenticatedOnly>
        )

        expect(screen.queryByText('Authenticated Content')).not.toBeInTheDocument()
      })

      it('should render fallback when user is not authenticated', () => {
        mockUseSession.mockReturnValue(withStatus('unauthenticated', null))

        render(
          <AuthenticatedOnly fallback={<div>Please Login</div>}>
            <div>Authenticated Content</div>
          </AuthenticatedOnly>
        )

        expect(screen.getByText('Please Login')).toBeInTheDocument()
      })
    })
  })
})
