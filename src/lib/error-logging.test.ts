/**
 * Tests for Error Logging
 */

jest.mock('@sentry/nextjs', () => ({
  withScope: jest.fn((callback) => {
    const mockScope = {
      setTag: jest.fn(),
      setLevel: jest.fn(),
      setUser: jest.fn(),
      setContext: jest.fn(),
    }
    callback(mockScope)
  }),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import {
  logError,
  ErrorType,
  ErrorSeverity,
  authError,
  validationError,
  databaseError,
  paymentError,
  apiError,
  trackUserAction,
  trackPerformance,
  withErrorHandling,
  shouldReportError,
  createErrorKey,
} from './error-logging'

describe('Error Logging', () => {
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  describe('logError', () => {
    it('logs error with Sentry', () => {
      const error = new Error('Test error')
      logError(error, ErrorType.SYSTEM, ErrorSeverity.HIGH)

      expect(Sentry.withScope).toHaveBeenCalled()
      expect(Sentry.captureException).toHaveBeenCalledWith(error)
    })

    it('logs string message with Sentry', () => {
      logError('Test message', ErrorType.VALIDATION, ErrorSeverity.LOW)

      expect(Sentry.captureMessage).toHaveBeenCalled()
    })

    it('sets user context when userId provided', () => {
      logError(new Error('Test'), ErrorType.SYSTEM, ErrorSeverity.MEDIUM, {
        userId: 'user_123',
        ip: '1.2.3.4',
      })

      expect(Sentry.withScope).toHaveBeenCalled()
    })

    it('sets organization context when provided', () => {
      logError(new Error('Test'), ErrorType.SYSTEM, ErrorSeverity.MEDIUM, {
        organizationId: 'org_123',
      })

      expect(Sentry.withScope).toHaveBeenCalled()
    })

    it('logs to console in development', () => {
      process.env.NODE_ENV = 'development'
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      logError(new Error('Test error'), ErrorType.DATABASE, ErrorSeverity.HIGH)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('convenience functions', () => {
    it('authError logs authentication error', () => {
      authError(new Error('Auth failed'), { userId: 'user_123' })

      expect(Sentry.withScope).toHaveBeenCalled()
    })

    it('validationError logs validation error', () => {
      validationError('Invalid email format')

      expect(Sentry.withScope).toHaveBeenCalled()
    })

    it('databaseError logs database error', () => {
      databaseError(new Error('Connection failed'))

      expect(Sentry.withScope).toHaveBeenCalled()
    })

    it('paymentError logs payment error', () => {
      paymentError(new Error('Stripe error'))

      expect(Sentry.withScope).toHaveBeenCalled()
    })

    it('apiError logs external API error', () => {
      apiError(new Error('GitHub API timeout'))

      expect(Sentry.withScope).toHaveBeenCalled()
    })
  })

  describe('trackUserAction', () => {
    it('adds breadcrumb for user action', () => {
      trackUserAction('button_clicked', { buttonId: 'submit' })

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'button_clicked',
          category: 'user_action',
        })
      )
    })

    it('sets user when userId provided', () => {
      trackUserAction('page_view', {}, 'user_123')

      expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'user_123' })
    })

    it('logs to console in development', () => {
      process.env.NODE_ENV = 'development'
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      trackUserAction('test_action', { key: 'value' })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('trackPerformance', () => {
    it('adds performance breadcrumb', () => {
      trackPerformance('database_query', 150, { table: 'users' })

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'performance',
          data: expect.objectContaining({
            operation: 'database_query',
            duration: 150,
          }),
        })
      )
    })

    it('logs slow operations', () => {
      trackPerformance('slow_operation', 2000)

      expect(Sentry.withScope).toHaveBeenCalled()
    })
  })

  describe('withErrorHandling', () => {
    it('wraps async function and catches errors', async () => {
      const failingFn = async () => {
        throw new Error('Function failed')
      }

      const wrapped = withErrorHandling(failingFn)

      await expect(wrapped()).rejects.toThrow('Function failed')
      expect(Sentry.withScope).toHaveBeenCalled()
    })

    it('returns result on success', async () => {
      const successFn = async () => 'success'
      const wrapped = withErrorHandling(successFn)

      const result = await wrapped()

      expect(result).toBe('success')
    })
  })

  describe('shouldReportError', () => {
    it('allows first error for a key', () => {
      expect(shouldReportError('unique_error_key_1')).toBe(true)
    })

    it('allows errors under rate limit', () => {
      const key = 'test_key_under_limit'
      for (let i = 0; i < 5; i++) {
        expect(shouldReportError(key)).toBe(true)
      }
    })

    it('blocks errors over rate limit', () => {
      const key = 'test_key_over_limit'
      for (let i = 0; i < 10; i++) {
        shouldReportError(key)
      }
      expect(shouldReportError(key)).toBe(false)
    })
  })

  describe('createErrorKey', () => {
    it('creates key from error object', () => {
      const error = new Error('Test error message')
      const key = createErrorKey(error, ErrorType.SYSTEM)

      expect(key).toBe('system:Test error message')
    })

    it('creates key from string', () => {
      const key = createErrorKey('String error', ErrorType.DATABASE)

      expect(key).toBe('database:String error')
    })

    it('truncates long error messages', () => {
      const longMessage = 'a'.repeat(200)
      const key = createErrorKey(longMessage, ErrorType.VALIDATION)

      expect(key.length).toBeLessThan(120)
    })
  })
})
