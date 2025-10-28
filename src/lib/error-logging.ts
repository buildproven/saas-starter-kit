import * as Sentry from '@sentry/nextjs'

// Define custom error types for better categorization
export enum ErrorType {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  DATABASE = 'database',
  EXTERNAL_API = 'external_api',
  PAYMENT = 'payment',
  USER_INPUT = 'user_input',
  SYSTEM = 'system',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

interface ErrorContext {
  userId?: string
  organizationId?: string
  requestId?: string
  userAgent?: string
  url?: string
  method?: string
  ip?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

// Enhanced error logging with context
export function logError(
  error: Error | string,
  type: ErrorType = ErrorType.SYSTEM,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  context: ErrorContext = {}
) {
  Sentry.withScope((scope) => {
    // Set error type and severity
    scope.setTag('error_type', type)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scope.setLevel(severity as any)

    // Add user context if available
    if (context.userId) {
      scope.setUser({
        id: context.userId,
        ip_address: context.ip,
      })
    }

    // Add organization context
    if (context.organizationId) {
      scope.setTag('organization_id', context.organizationId)
    }

    // Add request context
    if (context.requestId) {
      scope.setTag('request_id', context.requestId)
    }

    // Add additional context
    scope.setContext('error_context', {
      url: context.url,
      method: context.method,
      userAgent: context.userAgent,
      ...context,
    })

    // Capture the error
    if (typeof error === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Sentry.captureMessage(error, severity as any)
    } else {
      Sentry.captureException(error)
    }
  })

  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${type.toUpperCase()}] [${severity.toUpperCase()}]`, error, context)
  }
}

// Convenience functions for common error types
export const authError = (error: Error | string, context?: ErrorContext) =>
  logError(error, ErrorType.AUTHENTICATION, ErrorSeverity.MEDIUM, context)

export const validationError = (error: Error | string, context?: ErrorContext) =>
  logError(error, ErrorType.VALIDATION, ErrorSeverity.LOW, context)

export const databaseError = (error: Error | string, context?: ErrorContext) =>
  logError(error, ErrorType.DATABASE, ErrorSeverity.HIGH, context)

export const paymentError = (error: Error | string, context?: ErrorContext) =>
  logError(error, ErrorType.PAYMENT, ErrorSeverity.CRITICAL, context)

export const apiError = (error: Error | string, context?: ErrorContext) =>
  logError(error, ErrorType.EXTERNAL_API, ErrorSeverity.MEDIUM, context)

// Track user actions for debugging
export function trackUserAction(
  action: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any> = {},
  userId?: string
) {
  Sentry.addBreadcrumb({
    message: action,
    category: 'user_action',
    data,
    level: 'info',
  })

  if (userId) {
    Sentry.setUser({ id: userId })
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[USER_ACTION] ${action}`, data)
  }
}

// Performance monitoring
export function trackPerformance(
  operation: string,
  duration: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: Record<string, any> = {}
) {
  Sentry.addBreadcrumb({
    message: `${operation} completed in ${duration}ms`,
    category: 'performance',
    data: {
      operation,
      duration,
      ...context,
    },
    level: 'info',
  })

  // Log slow operations
  if (duration > 1000) {
    logError(
      `Slow operation: ${operation} took ${duration}ms`,
      ErrorType.SYSTEM,
      ErrorSeverity.MEDIUM,
      { operation, duration, ...context }
    )
  }
}

// Async error wrapper for better error handling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorHandling<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  errorType: ErrorType = ErrorType.SYSTEM,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args)
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        errorType,
        severity,
        { function: fn.name, arguments: args }
      )
      throw error
    }
  }
}

// Rate limiting for error reporting to prevent spam
const errorCounts = new Map<string, { count: number; lastReset: number }>()
const RATE_LIMIT_WINDOW = 60000 // 1 minute
const RATE_LIMIT_MAX = 10 // max 10 similar errors per minute

export function shouldReportError(errorKey: string): boolean {
  const now = Date.now()
  const current = errorCounts.get(errorKey)

  if (!current || now - current.lastReset > RATE_LIMIT_WINDOW) {
    errorCounts.set(errorKey, { count: 1, lastReset: now })
    return true
  }

  if (current.count < RATE_LIMIT_MAX) {
    current.count++
    return true
  }

  return false
}

// Create error key for rate limiting
export function createErrorKey(error: Error | string, type: ErrorType): string {
  const message = typeof error === 'string' ? error : error.message
  return `${type}:${message.slice(0, 100)}`
}