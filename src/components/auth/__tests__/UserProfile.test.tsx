import { render, screen } from '@testing-library/react'
import { useAuth } from '@/lib/hooks/useAuth'
import { UserProfile } from '../UserProfile'

vi.mock('@/lib/hooks/useAuth', () => ({ useAuth: vi.fn() }))

type AuthState = ReturnType<typeof useAuth>

function authState(overrides: Partial<AuthState> = {}): AuthState {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test User',
    image: undefined,
    role: 'USER' as const,
  }
  return {
    user,
    isAuthenticated: true,
    isLoading: false,
    role: 'USER',
    hasRole: (role) => role === 'USER',
    hasAnyRole: (roles) => roles.includes('USER'),
    hasAllRoles: (roles) => roles.every((role) => role === 'USER'),
    isAdmin: false,
    isSuperAdmin: false,
    canAccess: (role) => role === 'USER',
    ...overrides,
  }
}

const mockUseAuth = vi.mocked(useAuth)

describe('UserProfile', () => {
  it('renders the authenticated user name and email', () => {
    mockUseAuth.mockReturnValue(authState())
    render(<UserProfile />)

    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('user@example.com')).toBeInTheDocument()
    expect(screen.getByText('T')).toBeInTheDocument()
  })

  it('renders an image avatar when one is available', () => {
    mockUseAuth.mockReturnValue(
      authState({ user: { ...authState().user!, image: 'https://example.com/avatar.png' } })
    )
    render(<UserProfile />)

    expect(screen.getByRole('img', { name: 'Test User' })).toHaveAttribute(
      'src',
      expect.stringContaining('https%3A%2F%2Fexample.com%2Favatar.png')
    )
  })

  it('hides the email when requested', () => {
    mockUseAuth.mockReturnValue(authState())
    render(<UserProfile showEmail={false} />)

    expect(screen.queryByText('user@example.com')).not.toBeInTheDocument()
  })

  it('renders a skeleton while authentication is loading', () => {
    mockUseAuth.mockReturnValue(
      authState({ user: null, isAuthenticated: false, isLoading: true, role: null })
    )
    const { container } = render(<UserProfile />)

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders nothing when there is no authenticated user', () => {
    mockUseAuth.mockReturnValue(authState({ user: null, isAuthenticated: false, role: null }))
    const { container } = render(<UserProfile />)

    expect(container).toBeEmptyDOMElement()
  })
})
