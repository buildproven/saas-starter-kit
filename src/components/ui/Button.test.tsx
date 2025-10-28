import { render, screen, user } from '@/lib/test-utils'
import { Button } from './Button'

describe('Button Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders with default props', () => {
    render(<Button>Click me</Button>)

    const button = screen.getByRole('button', { name: /click me/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('bg-blue-600', 'text-white', 'px-4', 'py-2')
  })

  it('renders with different variants', () => {
    const { rerender } = render(<Button variant="secondary">Secondary</Button>)

    expect(screen.getByRole('button')).toHaveClass('bg-gray-200', 'text-gray-800')

    rerender(<Button variant="outline">Outline</Button>)
    expect(screen.getByRole('button')).toHaveClass('border-2', 'border-blue-600', 'text-blue-600')
  })

  it('renders with different sizes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>)

    expect(screen.getByRole('button')).toHaveClass('px-3', 'py-1.5', 'text-sm')

    rerender(<Button size="lg">Large</Button>)
    expect(screen.getByRole('button')).toHaveClass('px-6', 'py-3', 'text-lg')
  })

  it('shows loading state', () => {
    render(<Button isLoading>Loading</Button>)

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveClass('opacity-50', 'cursor-not-allowed')
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    // Check for spinner SVG
    const spinner = button.querySelector('svg')
    expect(spinner).toBeInTheDocument()
    expect(spinner).toHaveClass('animate-spin')
  })

  it('handles click events', async () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click me</Button>)

    const button = screen.getByRole('button', { name: /click me/i })
    await user.click(button)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('does not handle clicks when disabled', async () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick} disabled>Disabled</Button>)

    const button = screen.getByRole('button', { name: /disabled/i })
    expect(button).toBeDisabled()

    await user.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('does not handle clicks when loading', async () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick} isLoading>Loading</Button>)

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()

    await user.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('accepts custom className', () => {
    render(<Button className="custom-class">Custom</Button>)

    const button = screen.getByRole('button', { name: /custom/i })
    expect(button).toHaveClass('custom-class')
  })

  it('passes through other HTML attributes', () => {
    render(<Button data-testid="custom-button" aria-label="Custom button">Test</Button>)

    const button = screen.getByTestId('custom-button')
    expect(button).toHaveAttribute('aria-label', 'Custom button')
  })

  it('has correct accessibility attributes when disabled', () => {
    render(<Button disabled>Disabled</Button>)

    const button = screen.getByRole('button', { name: /disabled/i })
    expect(button).toHaveAttribute('disabled')
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })
})