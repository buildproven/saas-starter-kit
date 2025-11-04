import { render, screen, resetMocks } from '@/lib/test-utils'
import Home from './page'

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null }),
}))

describe('Home Page', () => {
  beforeEach(() => {
    resetMocks()
  })

  it('renders the marketing page', () => {
    render(<Home />)

    // Should have the main marketing heading
    expect(screen.getByRole('heading', { name: /launch your saas in days, not months/i })).toBeInTheDocument()
  })

  it('has navigation links', () => {
    render(<Home />)

    // Navigation links - Features and Pricing appear in both header and footer
    expect(screen.getAllByRole('link', { name: /features/i })).toHaveLength(2) // Header and footer
    expect(screen.getAllByRole('link', { name: /pricing/i })).toHaveLength(2) // Header and footer

    // Testimonials only appears in header
    expect(screen.getByRole('link', { name: /testimonials/i })).toBeInTheDocument()
  })

  it('has call-to-action buttons', () => {
    render(<Home />)

    expect(screen.getByRole('button', { name: /get started free/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /buy template/i })).toBeInTheDocument()
  })

  it('has proper page structure', () => {
    render(<Home />)

    // Should have header
    expect(screen.getByRole('banner')).toBeInTheDocument()

    // Should have navigation
    expect(screen.getByRole('navigation')).toBeInTheDocument()

    // Should have the main heading
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('displays features section', () => {
    render(<Home />)

    expect(screen.getByText(/everything you need to launch/i)).toBeInTheDocument()
    expect(screen.getByText(/lightning fast/i)).toBeInTheDocument()
    expect(screen.getByText(/enterprise security/i)).toBeInTheDocument()
  })

  it('displays pricing section', () => {
    render(<Home />)

    expect(screen.getByText(/simple, transparent pricing/i)).toBeInTheDocument()
    expect(screen.getByText(/monthly/i)).toBeInTheDocument()
    expect(screen.getByText(/yearly/i)).toBeInTheDocument()
  })

  it('has accessible structure', () => {
    render(<Home />)

    // Should have a banner (header)
    expect(screen.getByRole('banner')).toBeInTheDocument()

    // Should have navigation
    expect(screen.getByRole('navigation')).toBeInTheDocument()

    // Should have a main heading
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()

    // Buttons should be focusable
    const buttons = screen.getAllByRole('button')
    buttons.forEach(button => {
      expect(button).not.toHaveAttribute('disabled')
    })
  })
})