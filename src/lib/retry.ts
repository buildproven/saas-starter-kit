/**
 * Retry Logic with Exponential Backoff
 *
 * Automatically retries failed operations with exponential backoff and jitter.
 * Useful for external API calls that may fail transiently.
 */

import { logger } from './logger'

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Base delay in milliseconds (default: 1000) */
  baseDelay?: number
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean
  /** Function to determine if error is retryable (default: all errors retryable) */
  isRetryable?: (error: Error) => boolean
  /** Operation name for logging */
  operationName?: string
}

/**
 * Default implementation of retryable error check.
 * Retries on network errors, timeouts, and 5xx server errors.
 */
function defaultIsRetryable(error: Error): boolean {
  // Network errors
  if (
    error.message.includes('ECONNRESET') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ENOTFOUND') ||
    error.message.includes('EAI_AGAIN')
  ) {
    return true
  }

  // Timeout errors
  if (error.message.includes('timeout') || error.message.includes('timed out')) {
    return true
  }

  // Check for HTTP errors (if error has status code)
  const httpError = error as {
    statusCode?: number
    status?: number
    type?: string
  }
  if (httpError.statusCode && httpError.statusCode >= 500 && httpError.statusCode < 600) {
    return true
  }

  // Stripe-specific transient errors
  if (httpError.type === 'StripeConnectionError' || httpError.type === 'StripeAPIError') {
    return true
  }

  // GitHub API rate limiting
  if (httpError.status === 429) {
    return true
  }

  return false
}

/**
 * Execute a function with automatic retry logic.
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => stripe.customers.create({ email: 'test@example.com' }),
 *   { maxRetries: 3, operationName: 'create_stripe_customer' }
 * )
 * ```
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = true,
    isRetryable = defaultIsRetryable,
    operationName = 'operation',
  } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn()
      if (attempt > 1) {
        logger.info(
          {
            type: 'retry.success',
            operation: operationName,
            attempt,
          },
          `${operationName} succeeded on attempt ${attempt}`
        )
      }
      return result
    } catch (error) {
      lastError = error as Error

      // Don't retry if this is the last attempt
      if (attempt === maxRetries + 1) {
        logger.error(
          {
            type: 'retry.exhausted',
            operation: operationName,
            attempts: attempt,
            error: {
              name: lastError.name,
              message: lastError.message,
            },
          },
          `${operationName} failed after ${attempt} attempts`
        )
        throw lastError
      }

      // Check if error is retryable
      if (!isRetryable(lastError)) {
        logger.warn(
          {
            type: 'retry.non_retryable',
            operation: operationName,
            attempt,
            error: {
              name: lastError.name,
              message: lastError.message,
            },
          },
          `${operationName} failed with non-retryable error`
        )
        throw lastError
      }

      // Calculate delay with exponential backoff
      const exponentialDelay = Math.min(
        baseDelay * Math.pow(backoffMultiplier, attempt - 1),
        maxDelay
      )

      // Add jitter (random value between 0 and delay)
      const delay = jitter ? exponentialDelay * (0.5 + Math.random() * 0.5) : exponentialDelay

      logger.warn(
        {
          type: 'retry.attempt',
          operation: operationName,
          attempt,
          nextDelay: Math.round(delay),
          error: {
            name: lastError.name,
            message: lastError.message,
          },
        },
        `${operationName} failed on attempt ${attempt}, retrying in ${Math.round(delay)}ms`
      )

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry logic error')
}

/**
 * Create a retryable version of an async function.
 *
 * @param fn - The async function to make retryable
 * @param options - Retry configuration options
 * @returns A new function with retry logic
 *
 * @example
 * ```typescript
 * const createCustomerWithRetry = makeRetryable(
 *   (email: string) => stripe.customers.create({ email }),
 *   { maxRetries: 3, operationName: 'stripe.customers.create' }
 * )
 *
 * const customer = await createCustomerWithRetry('test@example.com')
 * ```
 */
export function makeRetryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    return withRetry(() => fn(...args), options)
  }
}

/**
 * Execute a function with a timeout.
 *
 * @param fn - The async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Operation name for error messages
 * @returns The result of the function
 * @throws TimeoutError if the operation times out
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   () => fetch('https://api.example.com/slow'),
 *   5000,
 *   'fetch_api'
 * )
 * ```
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName = 'operation'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error(`${operationName} timed out after ${timeoutMs}ms`)
      error.name = 'TimeoutError'
      logger.error(
        {
          type: 'timeout',
          operation: operationName,
          timeout: timeoutMs,
        },
        error.message
      )
      reject(error)
    }, timeoutMs)

    fn()
      .then((result) => {
        clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

/**
 * Combine retry logic with timeout.
 *
 * @param fn - The async function to execute
 * @param timeoutMs - Timeout in milliseconds per attempt
 * @param retryOptions - Retry configuration options
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const result = await withRetryAndTimeout(
 *   () => octokit.rest.teams.addOrUpdateMembershipForUserInOrg({...}),
 *   30000, // 30 second timeout per attempt
 *   { maxRetries: 3, operationName: 'github.add_team_member' }
 * )
 * ```
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryOptions: RetryOptions = {}
): Promise<T> {
  return withRetry(
    () => withTimeout(fn, timeoutMs, retryOptions.operationName || 'operation'),
    retryOptions
  )
}
