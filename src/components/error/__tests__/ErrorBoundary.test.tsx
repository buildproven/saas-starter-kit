import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorInfo } from 'react'
import { ErrorBoundary, withErrorBoundary } from '../ErrorBoundary'

vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn((callback) => {
    const mockScope = {
      setTag: vi.fn(),
      setContext: vi.fn(),
    }
    callback(mockScope)
  }),
  captureException: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'

const ThrowError = ({ error }: { error: Error }) => {
  throw error
}

const NormalComponent = ({ children }: { children?: React.ReactNode }) => {
  return <div>{children || 'Normal content'}</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('normal rendering', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Normal content</div>
        </ErrorBoundary>
      )

      expect(screen.getByText('Normal content')).toBeInTheDocument()
    })

    it('renders complex children components', () => {
      render(
        <ErrorBoundary>
          <NormalComponent>
            <div>Nested content</div>
          </NormalComponent>
        </ErrorBoundary>
      )

      expect(screen.getByText('Nested content')).toBeInTheDocument()
    })
  })

  describe('error catching', () => {
    it('catches errors and renders default fallback UI', () => {
      const error = new Error('Test error message')

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('This component failed to render properly.')).toBeInTheDocument()
    })

    it('renders custom fallback UI when provided', () => {
      const error = new Error('Test error')
      const customFallback = <div>Custom error message</div>

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Custom error message')).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    })

    it('displays Try again button in default fallback', () => {
      const error = new Error('Test error')

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  describe('Sentry integration', () => {
    it('logs error to Sentry when error is caught', () => {
      const error = new Error('Test error for Sentry')

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(Sentry.withScope).toHaveBeenCalled()
      expect(Sentry.captureException).toHaveBeenCalledWith(error)
    })

    it('sets correct Sentry scope tags', () => {
      const error = new Error('Test error')
      const mockScope = {
        setTag: vi.fn(),
        setContext: vi.fn(),
      }

      vi.mocked(Sentry.withScope).mockImplementation(((callback: (scope: unknown) => void) => {
        callback(mockScope)
      }) as never)

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(mockScope.setTag).toHaveBeenCalledWith('component', 'ErrorBoundary')
    })

    it('sets error context with component stack', () => {
      const error = new Error('Test error')
      const mockScope = {
        setTag: vi.fn(),
        setContext: vi.fn(),
      }

      vi.mocked(Sentry.withScope).mockImplementation(((callback: (scope: unknown) => void) => {
        callback(mockScope)
      }) as never)

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'errorInfo',
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      )
    })
  })

  describe('error callback', () => {
    it('calls onError callback when provided', () => {
      const error = new Error('Test error')
      const onError = vi.fn()

      render(
        <ErrorBoundary onError={onError}>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(onError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      )
    })

    it('does not crash when onError is not provided', () => {
      const error = new Error('Test error')

      expect(() => {
        render(
          <ErrorBoundary>
            <ThrowError error={error} />
          </ErrorBoundary>
        )
      }).not.toThrow()
    })

    it('calls onError with correct ErrorInfo', () => {
      const error = new Error('Test error')
      const onError = vi.fn()

      render(
        <ErrorBoundary onError={onError}>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      const errorInfo = onError.mock.calls[0]![1] as ErrorInfo
      expect(errorInfo).toHaveProperty('componentStack')
      expect(typeof errorInfo.componentStack).toBe('string')
    })
  })

  describe('reset functionality', () => {
    it('resets error state when Try again is clicked', async () => {
      const user = userEvent.setup()
      let shouldThrow = true
      const error = new Error('Test error')

      const ConditionalThrow = () => {
        if (shouldThrow) throw error
        return <div>Recovered content</div>
      }

      const { rerender } = render(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      shouldThrow = false

      const tryAgainButton = screen.getByRole('button', { name: /try again/i })
      await user.click(tryAgainButton)

      rerender(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      )

      expect(screen.getByText('Recovered content')).toBeInTheDocument()
    })

    it('clears error from state after reset', async () => {
      const user = userEvent.setup()
      let shouldThrow = true

      const ConditionalComponent = () => {
        if (shouldThrow) {
          throw new Error('Test error')
        }
        return <div>Normal content</div>
      }

      const { rerender } = render(
        <ErrorBoundary>
          <ConditionalComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      shouldThrow = false

      const tryAgainButton = screen.getByRole('button', { name: /try again/i })
      await user.click(tryAgainButton)

      rerender(
        <ErrorBoundary>
          <ConditionalComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Normal content')).toBeInTheDocument()
    })
  })

  describe('different error types', () => {
    it('handles TypeError correctly', () => {
      const error = new TypeError('Cannot read property of undefined')

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(Sentry.captureException).toHaveBeenCalledWith(error)
    })

    it('handles ReferenceError correctly', () => {
      const error = new ReferenceError('Variable is not defined')

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(Sentry.captureException).toHaveBeenCalledWith(error)
    })

    it('handles custom errors correctly', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'CustomError'
        }
      }

      const error = new CustomError('Custom error occurred')

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(Sentry.captureException).toHaveBeenCalledWith(error)
    })

    it('handles errors with stack traces', () => {
      const error = new Error('Error with stack')
      error.stack = 'Error: Error with stack\n    at TestComponent (test.tsx:10:15)'

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(Sentry.captureException).toHaveBeenCalledWith(error)
    })
  })

  describe('development mode features', () => {
    it('shows error details in development mode', () => {
      vi.stubEnv('NODE_ENV', 'development')

      const error = new Error('Development error')
      error.stack = 'Error: Development error\n    at Component'

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(screen.getByText(/error details \(development only\)/i)).toBeInTheDocument()

      vi.unstubAllEnvs()
    })

    it('does not show error details in production', () => {
      vi.stubEnv('NODE_ENV', 'production')

      const error = new Error('Production error')

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(screen.queryByText(/error details/i)).not.toBeInTheDocument()

      vi.unstubAllEnvs()
    })

    it('displays error message in development details', () => {
      vi.stubEnv('NODE_ENV', 'development')

      const error = new Error('Detailed error message')

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(screen.getByText(/Detailed error message/i)).toBeInTheDocument()

      vi.unstubAllEnvs()
    })
  })

  describe('withErrorBoundary HOC', () => {
    it('wraps component with ErrorBoundary', () => {
      const TestComponent = () => <div>Test component</div>
      const WrappedComponent = withErrorBoundary(TestComponent)

      render(<WrappedComponent />)

      expect(screen.getByText('Test component')).toBeInTheDocument()
    })

    it('catches errors in wrapped component', () => {
      const ErrorComponent = () => {
        throw new Error('HOC error')
      }
      const WrappedComponent = withErrorBoundary(ErrorComponent)

      render(<WrappedComponent />)

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('passes props to wrapped component', () => {
      const TestComponent = ({ text }: { text: string }) => <div>{text}</div>
      const WrappedComponent = withErrorBoundary(TestComponent)

      render(<WrappedComponent text="Passed prop" />)

      expect(screen.getByText('Passed prop')).toBeInTheDocument()
    })

    it('uses custom fallback when provided', () => {
      const ErrorComponent = () => {
        throw new Error('HOC error')
      }
      const customFallback = <div>HOC custom fallback</div>
      const WrappedComponent = withErrorBoundary(ErrorComponent, customFallback)

      render(<WrappedComponent />)

      expect(screen.getByText('HOC custom fallback')).toBeInTheDocument()
    })

    it('uses custom onError callback', () => {
      const onError = vi.fn()
      const ErrorComponent = () => {
        throw new Error('HOC error')
      }
      const WrappedComponent = withErrorBoundary(ErrorComponent, undefined, onError)

      render(<WrappedComponent />)

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      )
    })
  })

  describe('UI and styling', () => {
    it('renders error icon in default fallback', () => {
      const error = new Error('Test error')

      const { container } = render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveClass('w-6', 'h-6', 'text-red-600')
    })

    it('applies correct CSS classes to default fallback', () => {
      const error = new Error('Test error')

      const { container } = render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      const fallbackDiv = container.querySelector('.min-h-\\[200px\\]')
      expect(fallbackDiv).toBeInTheDocument()
    })

    it('renders Try again button with correct styling', () => {
      const error = new Error('Test error')

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      const button = screen.getByRole('button', { name: /try again/i })
      expect(button).toHaveClass('bg-blue-600', 'text-white')
    })
  })

  describe('edge cases', () => {
    it('handles multiple errors in sequence', () => {
      const error1 = new Error('First error')

      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError error={error1} />
        </ErrorBoundary>
      )

      expect(Sentry.captureException).toHaveBeenCalledWith(error1)
      expect(Sentry.captureException).toHaveBeenCalledTimes(1)

      const error2 = new Error('Second error')

      rerender(
        <ErrorBoundary>
          <ThrowError error={error2} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('handles empty error message', () => {
      const error = new Error('')

      render(
        <ErrorBoundary>
          <ThrowError error={error} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('does not call onError when no error occurs', () => {
      const onError = vi.fn()

      render(
        <ErrorBoundary onError={onError}>
          <div>Normal content</div>
        </ErrorBoundary>
      )

      expect(onError).not.toHaveBeenCalled()
    })
  })
})
