import { render, screen } from '@testing-library/react'
import type { Session } from 'next-auth'
import { useSession } from 'next-auth/react'
import { UserProfile } from '../UserProfile'

// Mock next-auth
vi.mock('next-auth/react')
const mockUseSession = useSession as vi.MockedFunction<typeof useSession>

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: function MockImage({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string
    alt: string
    width: number
    height: number
    className: string
  }) {
    return <img src={src} alt={alt} width={width} height={height} className={className} />
  },
}))

interface TestUser extends Record<string, unknown> {
  name?: string
  email?: string
  image?: string
}

const createSession = (user: TestUser): Session => ({
  user: user as TestUser,
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

describe('UserProfile', () => {
  describe('Rendering user information', () => {
    it('should render user name and email when both are provided', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: 'John Doe',
            email: 'john@example.com',
            image: 'https://example.com/avatar.jpg',
          })
        )
      )

      render(<UserProfile />)

      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
    })

    it('should render user avatar image when provided', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: 'John Doe',
            email: 'john@example.com',
            image: 'https://example.com/avatar.jpg',
          })
        )
      )

      render(<UserProfile />)

      const avatar = screen.getByAltText('John Doe')
      expect(avatar).toBeInTheDocument()
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg')
      expect(avatar).toHaveAttribute('width', '32')
      expect(avatar).toHaveAttribute('height', '32')
    })

    it('should render only user name when showEmail is false', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: 'John Doe',
            email: 'john@example.com',
          })
        )
      )

      render(<UserProfile showEmail={false} />)

      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.queryByText('john@example.com')).not.toBeInTheDocument()
    })

    it('should apply custom className when provided', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: 'John Doe',
            email: 'john@example.com',
          })
        )
      )

      const { container } = render(<UserProfile className="custom-class" />)

      const profileDiv = container.firstChild as HTMLElement
      expect(profileDiv).toHaveClass('custom-class')
    })
  })

  describe('Fallback behaviors', () => {
    it('should render fallback avatar with first letter of name when no image', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: 'John Doe',
            email: 'john@example.com',
          })
        )
      )

      render(<UserProfile />)

      const fallbackAvatar = screen.getByText('J')
      expect(fallbackAvatar).toBeInTheDocument()
      expect(fallbackAvatar).toHaveClass('w-8', 'h-8', 'bg-gray-400', 'rounded-full')
    })

    it('should render fallback avatar with first letter of email when no name', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            email: 'john@example.com',
          })
        )
      )

      render(<UserProfile />)

      const fallbackAvatar = screen.getByText('j')
      expect(fallbackAvatar).toBeInTheDocument()
    })

    it('should render question mark in fallback avatar when no name or email', () => {
      mockUseSession.mockReturnValue(withStatus('authenticated', createSession({})))

      render(<UserProfile />)

      const fallbackAvatar = screen.getByText('?')
      expect(fallbackAvatar).toBeInTheDocument()
    })

    it('should use email for avatar alt text when name is not provided', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            email: 'john@example.com',
            image: 'https://example.com/avatar.jpg',
          })
        )
      )

      render(<UserProfile />)

      const avatar = screen.getByAltText('User avatar')
      expect(avatar).toBeInTheDocument()
    })

    it('should not render email when user has no email', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: 'John Doe',
          })
        )
      )

      const { container } = render(<UserProfile />)

      expect(screen.getByText('John Doe')).toBeInTheDocument()
      const emailSpan = container.querySelector('.text-xs.text-gray-500')
      expect(emailSpan).not.toBeInTheDocument()
    })

    it('should not render name when user has no name', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            email: 'john@example.com',
          })
        )
      )

      const { container } = render(<UserProfile />)

      expect(screen.getByText('john@example.com')).toBeInTheDocument()
      const nameSpan = container.querySelector('.text-sm.font-medium.text-gray-900')
      expect(nameSpan).not.toBeInTheDocument()
    })
  })

  describe('Loading states', () => {
    it('should render loading skeleton when status is loading', () => {
      mockUseSession.mockReturnValue(withStatus('loading', null))

      const { container } = render(<UserProfile />)

      const skeleton = container.querySelector('.animate-pulse')
      expect(skeleton).toBeInTheDocument()

      // Check for skeleton avatar
      const skeletonAvatar = container.querySelector('.w-8.h-8.bg-gray-300.rounded-full')
      expect(skeletonAvatar).toBeInTheDocument()

      // Check for skeleton name
      const skeletonName = container.querySelector('.w-24.h-4.bg-gray-300.rounded')
      expect(skeletonName).toBeInTheDocument()

      // Check for skeleton email
      const skeletonEmail = container.querySelector('.w-32.h-3.bg-gray-300.rounded')
      expect(skeletonEmail).toBeInTheDocument()
    })

    it('should not render email skeleton when showEmail is false', () => {
      mockUseSession.mockReturnValue(withStatus('loading', null))

      const { container } = render(<UserProfile showEmail={false} />)

      const skeleton = container.querySelector('.animate-pulse')
      expect(skeleton).toBeInTheDocument()

      // Email skeleton should not be present
      const skeletonEmail = container.querySelector('.w-32.h-3.bg-gray-300.rounded')
      expect(skeletonEmail).not.toBeInTheDocument()
    })

    it('should apply className to loading skeleton', () => {
      mockUseSession.mockReturnValue(withStatus('loading', null))

      const { container } = render(<UserProfile className="custom-loading" />)

      const skeleton = container.firstChild as HTMLElement
      expect(skeleton).toHaveClass('custom-loading')
    })
  })

  describe('Unauthenticated states', () => {
    it('should render nothing when session is null', () => {
      mockUseSession.mockReturnValue(withStatus('unauthenticated', null))

      const { container } = render(<UserProfile />)

      expect(container.firstChild).toBeNull()
    })

    it('should render nothing when session exists but user is null', () => {
      mockUseSession.mockReturnValue(
        withStatus('authenticated', {
          user: null,
          expires: '2025-01-01T00:00:00.000Z',
        } as unknown as Session)
      )

      const { container } = render(<UserProfile />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('Different user data shapes', () => {
    it('should handle user with only name', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: 'Jane Smith',
          })
        )
      )

      render(<UserProfile />)

      expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      expect(screen.getByText('J')).toBeInTheDocument() // Fallback avatar
    })

    it('should handle user with only email', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            email: 'jane@example.com',
          })
        )
      )

      render(<UserProfile />)

      expect(screen.getByText('jane@example.com')).toBeInTheDocument()
      expect(screen.getByText('j')).toBeInTheDocument() // Fallback avatar with email initial
    })

    it('should handle user with name, email, and image', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: 'Jane Smith',
            email: 'jane@example.com',
            image: 'https://example.com/jane.jpg',
          })
        )
      )

      render(<UserProfile />)

      expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      expect(screen.getByText('jane@example.com')).toBeInTheDocument()
      expect(screen.getByAltText('Jane Smith')).toBeInTheDocument()
    })

    it('should handle user with additional custom fields', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: 'John Doe',
            email: 'john@example.com',
            role: 'ADMIN',
            organizationId: 'org_123',
          })
        )
      )

      render(<UserProfile />)

      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
    })

    it('should handle names with special characters', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: "O'Brien, Mary-Jane",
            email: 'mary@example.com',
          })
        )
      )

      render(<UserProfile />)

      expect(screen.getByText("O'Brien, Mary-Jane")).toBeInTheDocument()
      expect(screen.getByText('O')).toBeInTheDocument() // First character
    })

    it('should handle email addresses with special characters', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            email: 'user+test@example.com',
          })
        )
      )

      render(<UserProfile />)

      expect(screen.getByText('user+test@example.com')).toBeInTheDocument()
      expect(screen.getByText('u')).toBeInTheDocument() // First character
    })

    it('should handle very long names gracefully', () => {
      const longName = 'Christopher Alexander Montgomery Wellington III'
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: longName,
            email: 'chris@example.com',
          })
        )
      )

      render(<UserProfile />)

      expect(screen.getByText(longName)).toBeInTheDocument()
      expect(screen.getByText('C')).toBeInTheDocument()
    })

    it('should handle single character names', () => {
      mockUseSession.mockReturnValue(
        withStatus(
          'authenticated',
          createSession({
            name: 'X',
            email: 'x@example.com',
          })
        )
      )

      const { container } = render(<UserProfile />)

      // Check that both avatar and name contain 'X'
      const nameSpan = container.querySelector('.text-sm.font-medium.text-gray-900')
      expect(nameSpan).toHaveTextContent('X')

      const fallbackAvatar = container.querySelector('.w-8.h-8.bg-gray-400.rounded-full')
      expect(fallbackAvatar).toHaveTextContent('X')

      expect(screen.getByText('x@example.com')).toBeInTheDocument()
    })
  })
})
