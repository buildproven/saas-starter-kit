/**
 * Tests for Logger
 */

vi.mock('pino', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }
  const pino = vi.fn().mockReturnValue(mockLogger)
  // Add serializers
  pino.stdSerializers = {
    err: vi.fn(),
    req: vi.fn(),
    res: vi.fn(),
  }
  return { default: pino }
})

import pino from 'pino'
import {
  logger,
  createContextLogger,
  logRequest,
  logResponse,
  logError,
  logPerformance,
  events,
  security,
} from './logger'

const mockLogger = pino() as vi.Mocked<ReturnType<typeof pino>>

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('logger instance', () => {
    it('exports a logger instance', () => {
      expect(logger).toBeDefined()
    })
  })

  describe('createContextLogger', () => {
    it('creates child logger with context', () => {
      const context = { requestId: 'req_123', userId: 'user_456' }
      createContextLogger(context)

      expect(mockLogger.child).toHaveBeenCalledWith(context)
    })
  })

  describe('logRequest', () => {
    it('logs HTTP request with details', () => {
      logRequest({
        method: 'GET',
        url: '/api/test',
        headers: {
          'user-agent': 'Mozilla/5.0',
          'x-forwarded-for': '1.2.3.4',
        },
        userId: 'user_123',
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'http.request',
          method: 'GET',
          url: '/api/test',
          userId: 'user_123',
        }),
        expect.any(String)
      )
    })
  })

  describe('logResponse', () => {
    it('logs successful response as info', () => {
      logResponse({ method: 'GET', url: '/api/test' }, { statusCode: 200 }, 50)

      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('logs 4xx response as warn', () => {
      logResponse({ method: 'GET', url: '/api/test' }, { statusCode: 404 }, 50)

      expect(mockLogger.warn).toHaveBeenCalled()
    })

    it('logs 5xx response as error', () => {
      logResponse({ method: 'GET', url: '/api/test' }, { statusCode: 500 }, 50)

      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('logError', () => {
    it('logs error with context', () => {
      const error = new Error('Test error')
      logError(error, { requestId: 'req_123' })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          error: expect.objectContaining({
            name: 'Error',
            message: 'Test error',
          }),
        }),
        'Test error'
      )
    })
  })

  describe('logPerformance', () => {
    it('logs performance metrics', () => {
      logPerformance('database_query', 150, { table: 'users' })

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'performance',
          operation: 'database_query',
          duration: 150,
          table: 'users',
        }),
        expect.stringContaining('150ms')
      )
    })
  })

  describe('events', () => {
    it('logs user created event', () => {
      events.userCreated('user_123', 'google')

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'user.created',
          userId: 'user_123',
          provider: 'google',
        }),
        expect.any(String)
      )
    })

    it('logs user signed in event', () => {
      events.userSignedIn('user_123', 'credentials')

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'user.signin',
        }),
        expect.any(String)
      )
    })

    it('logs template purchased event', () => {
      events.templatePurchased('sale_123', 'pro', 24900)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'template.purchased',
          saleId: 'sale_123',
          package: 'pro',
          amount: 24900,
        }),
        expect.any(String)
      )
    })

    it('logs subscription created event', () => {
      events.subscriptionCreated('sub_123', 'org_456', 'price_789')

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscription.created',
        }),
        expect.any(String)
      )
    })

    it('logs subscription canceled event as warning', () => {
      events.subscriptionCanceled('sub_123', 'org_456')

      expect(mockLogger.warn).toHaveBeenCalled()
    })

    it('logs webhook received event', () => {
      events.webhookReceived('checkout.session.completed', 'evt_123')

      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('logs webhook processed success', () => {
      events.webhookProcessed('checkout.session.completed', 'evt_123', true)

      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('logs webhook processed failure as error', () => {
      events.webhookProcessed('checkout.session.completed', 'evt_123', false)

      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('security', () => {
    it('logs rate limit exceeded', () => {
      security.rateLimitExceeded('1.2.3.4', '/api/checkout')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'security.rate_limit',
          ip: '1.2.3.4',
          endpoint: '/api/checkout',
        }),
        expect.any(String)
      )
    })

    it('logs invalid token', () => {
      security.invalidToken('abc123xyz789', 'expired')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'security.invalid_token',
          reason: 'expired',
        }),
        expect.any(String)
      )
    })

    it('logs path traversal attempt', () => {
      security.pathTraversal('../../../etc/passwd', '1.2.3.4')

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'security.path_traversal',
        }),
        expect.any(String)
      )
    })

    it('logs unauthorized access', () => {
      security.unauthorizedAccess('user_123', '/admin/users')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'security.unauthorized',
          userId: 'user_123',
          resource: '/admin/users',
        }),
        expect.any(String)
      )
    })
  })
})
