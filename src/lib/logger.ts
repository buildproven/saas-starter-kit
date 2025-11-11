/**
 * Structured Logging with Pino
 *
 * Provides JSON-formatted structured logging for production observability.
 * Automatically redacts sensitive fields like passwords, tokens, and emails.
 */

import pino from 'pino'

// Determine if we're in development
const isDevelopment = process.env.NODE_ENV === 'development'

// Create logger instance
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

  // Pretty print in development, JSON in production
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,

  // Formatters
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
    }),
  },

  // Serialize errors properly
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
      'req.body.secret',
      'email',
      'customerEmail',
      'apiKey',
      'downloadToken',
      'licenseKey',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
    ],
    remove: true, // Remove instead of replacing with [Redacted]
  },

  // Base fields included in all logs
  base: {
    env: process.env.NODE_ENV,
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  },
})

/**
 * Create a child logger with additional context
 */
export function createContextLogger(context: Record<string, unknown>) {
  return logger.child(context)
}

/**
 * Log HTTP request
 */
export function logRequest(req: {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  userId?: string
}) {
  logger.info(
    {
      type: 'http.request',
      method: req.method,
      url: req.url,
      userId: req.userId,
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'],
    },
    `${req.method} ${req.url}`
  )
}

/**
 * Log HTTP response
 */
export function logResponse(
  req: { method: string; url: string },
  res: { statusCode: number },
  duration: number
) {
  const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'

  logger[level](
    {
      type: 'http.response',
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
    },
    `${req.method} ${req.url} ${res.statusCode} ${duration}ms`
  )
}

/**
 * Log business events
 */
export const events = {
  userCreated: (userId: string, provider: string) => {
    logger.info(
      {
        type: 'user.created',
        userId,
        provider,
      },
      `User created via ${provider}`
    )
  },

  userSignedIn: (userId: string, provider: string) => {
    logger.info(
      {
        type: 'user.signin',
        userId,
        provider,
      },
      `User signed in via ${provider}`
    )
  },

  userSignedOut: (userId: string) => {
    logger.info(
      {
        type: 'user.signout',
        userId,
      },
      'User signed out'
    )
  },

  templatePurchased: (saleId: string, packageType: string, amount: number) => {
    logger.info(
      {
        type: 'template.purchased',
        saleId,
        package: packageType,
        amount,
      },
      `Template purchased: ${packageType}`
    )
  },

  templateDownloaded: (downloadToken: string, packageType: string, status: string) => {
    logger.info(
      {
        type: 'template.downloaded',
        downloadToken,
        package: packageType,
        status,
      },
      `Template download: ${status}`
    )
  },

  apiKeyCreated: (keyId: string, organizationId: string, scopes: string[]) => {
    logger.info(
      {
        type: 'apikey.created',
        keyId,
        organizationId,
        scopes,
      },
      'API key created'
    )
  },

  subscriptionCreated: (subscriptionId: string, organizationId: string, priceId: string) => {
    logger.info(
      {
        type: 'subscription.created',
        subscriptionId,
        organizationId,
        priceId,
      },
      'Subscription created'
    )
  },

  subscriptionCanceled: (subscriptionId: string, organizationId: string) => {
    logger.warn(
      {
        type: 'subscription.canceled',
        subscriptionId,
        organizationId,
      },
      'Subscription canceled'
    )
  },

  webhookReceived: (eventType: string, eventId: string) => {
    logger.info(
      {
        type: 'webhook.received',
        eventType,
        eventId,
      },
      `Webhook received: ${eventType}`
    )
  },

  webhookProcessed: (eventType: string, eventId: string, success: boolean) => {
    const level = success ? 'info' : 'error'
    logger[level](
      {
        type: 'webhook.processed',
        eventType,
        eventId,
        success,
      },
      `Webhook processed: ${eventType} - ${success ? 'success' : 'failed'}`
    )
  },
}

/**
 * Log errors with context
 */
export function logError(error: Error, context?: Record<string, unknown>) {
  logger.error(
    {
      type: 'error',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...context,
    },
    error.message
  )
}

/**
 * Log performance metrics
 */
export function logPerformance(
  operation: string,
  duration: number,
  context?: Record<string, unknown>
) {
  logger.info(
    {
      type: 'performance',
      operation,
      duration,
      ...context,
    },
    `${operation} took ${duration}ms`
  )
}

/**
 * Log security events
 */
export const security = {
  rateLimitExceeded: (ip: string, endpoint: string) => {
    logger.warn(
      {
        type: 'security.rate_limit',
        ip,
        endpoint,
      },
      `Rate limit exceeded from ${ip}`
    )
  },

  invalidToken: (token: string, reason: string) => {
    logger.warn(
      {
        type: 'security.invalid_token',
        token: token.substring(0, 10) + '...',
        reason,
      },
      `Invalid token: ${reason}`
    )
  },

  pathTraversal: (path: string, ip: string) => {
    logger.error(
      {
        type: 'security.path_traversal',
        path,
        ip,
      },
      `Path traversal attempt blocked: ${path}`
    )
  },

  unauthorizedAccess: (userId: string | undefined, resource: string) => {
    logger.warn(
      {
        type: 'security.unauthorized',
        userId,
        resource,
      },
      `Unauthorized access attempt to ${resource}`
    )
  },
}

export default logger
