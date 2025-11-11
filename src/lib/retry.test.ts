import { withRetry, makeRetryable, withTimeout, withRetryAndTimeout } from './retry'
import { logger } from './logger'

jest.mock('./logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('retry', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('withRetry', () => {
    describe('TEST-001-01: Exponential backoff with jitter', () => {
      it('calculates exponential backoff correctly', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts < 4) {
            throw new Error('ECONNRESET')
          }
          return 'success'
        })

        const promise = withRetry(fn, {
          maxRetries: 3,
          baseDelay: 1000,
          backoffMultiplier: 2,
          jitter: false, // Disable jitter for predictable testing
          operationName: 'test_exponential',
        })

        // First attempt fails immediately
        await jest.advanceTimersByTimeAsync(0)

        // Second attempt after 1000ms (baseDelay * 2^0)
        await jest.advanceTimersByTimeAsync(1000)

        // Third attempt after 2000ms (baseDelay * 2^1)
        await jest.advanceTimersByTimeAsync(2000)

        // Fourth attempt after 4000ms (baseDelay * 2^2)
        await jest.advanceTimersByTimeAsync(4000)

        const result = await promise
        expect(result).toBe('success')
        expect(fn).toHaveBeenCalledTimes(4)
      })

      it('applies jitter to delay calculations', async () => {
        const delays: number[] = []
        jest.useRealTimers() // Use real timers to test jitter randomness

        const fn = jest.fn(async () => {
          throw new Error('ECONNRESET')
        })

        const startTime = Date.now()
        let _lastAttemptTime = startTime

        // Spy on setTimeout to capture actual delays
        const originalSetTimeout = global.setTimeout
        global.setTimeout = jest.fn((callback, delay) => {
          if (typeof delay === 'number') {
            delays.push(delay)
          }
          return originalSetTimeout(callback as () => void, delay)
        }) as typeof setTimeout

        try {
          await withRetry(fn, {
            maxRetries: 2,
            baseDelay: 1000,
            backoffMultiplier: 2,
            jitter: true,
            operationName: 'test_jitter',
          }).catch(() => {
            /* Expected to fail */
          })

          // Jitter should make delays between 50% and 100% of exponential value
          // First delay: 1000ms * [0.5, 1.0] = [500ms, 1000ms]
          expect(delays[0]).toBeGreaterThanOrEqual(500)
          expect(delays[0]).toBeLessThanOrEqual(1000)

          // Second delay: 2000ms * [0.5, 1.0] = [1000ms, 2000ms]
          expect(delays[1]).toBeGreaterThanOrEqual(1000)
          expect(delays[1]).toBeLessThanOrEqual(2000)
        } finally {
          global.setTimeout = originalSetTimeout
        }
      })

      it('respects maxDelay ceiling', async () => {
        const fn = jest.fn(async () => {
          throw new Error('ECONNRESET')
        })

        const promise = withRetry(fn, {
          maxRetries: 5,
          baseDelay: 1000,
          backoffMultiplier: 2,
          maxDelay: 3000, // Cap at 3 seconds
          jitter: false,
          operationName: 'test_max_delay',
        }).catch(() => {
          /* Expected to fail */
        })

        await jest.advanceTimersByTimeAsync(0) // 1st attempt
        await jest.advanceTimersByTimeAsync(1000) // 2nd: 1000ms
        await jest.advanceTimersByTimeAsync(2000) // 3rd: 2000ms
        await jest.advanceTimersByTimeAsync(3000) // 4th: 3000ms (capped)
        await jest.advanceTimersByTimeAsync(3000) // 5th: 3000ms (capped)
        await jest.advanceTimersByTimeAsync(3000) // 6th: 3000ms (capped)

        await promise
        expect(fn).toHaveBeenCalledTimes(6)
      })
    })

    describe('TEST-001-02: Retryable vs non-retryable error classification', () => {
      it('retries network errors (ECONNRESET)', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts < 3) {
            const error = new Error('Connection reset by peer')
            error.message = 'ECONNRESET'
            throw error
          }
          return 'success'
        })

        const promise = withRetry(fn, { maxRetries: 3, baseDelay: 100, jitter: false })

        await jest.advanceTimersByTimeAsync(0)
        await jest.advanceTimersByTimeAsync(100)
        await jest.advanceTimersByTimeAsync(200)

        const result = await promise
        expect(result).toBe('success')
        expect(fn).toHaveBeenCalledTimes(3)
      })

      it('retries timeout errors', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts < 2) {
            throw new Error('Request timed out')
          }
          return 'success'
        })

        const promise = withRetry(fn, { maxRetries: 2, baseDelay: 100, jitter: false })

        await jest.advanceTimersByTimeAsync(0)
        await jest.advanceTimersByTimeAsync(100)

        const result = await promise
        expect(result).toBe('success')
      })

      it('retries 5xx server errors', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts < 2) {
            const error = new Error('Internal Server Error') as Error & { statusCode: number }
            error.statusCode = 503
            throw error
          }
          return 'success'
        })

        const promise = withRetry(fn, { maxRetries: 2, baseDelay: 100, jitter: false })

        await jest.advanceTimersByTimeAsync(0)
        await jest.advanceTimersByTimeAsync(100)

        const result = await promise
        expect(result).toBe('success')
      })

      it('retries Stripe connection errors', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts < 2) {
            const error = new Error('Stripe connection failed') as Error & { type: string }
            error.type = 'StripeConnectionError'
            throw error
          }
          return 'success'
        })

        const promise = withRetry(fn, { maxRetries: 2, baseDelay: 100, jitter: false })

        await jest.advanceTimersByTimeAsync(0)
        await jest.advanceTimersByTimeAsync(100)

        const result = await promise
        expect(result).toBe('success')
      })

      it('retries GitHub rate limit errors (429)', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts < 2) {
            const error = new Error('Rate limit exceeded') as Error & { status: number }
            error.status = 429
            throw error
          }
          return 'success'
        })

        const promise = withRetry(fn, { maxRetries: 2, baseDelay: 100, jitter: false })

        await jest.advanceTimersByTimeAsync(0)
        await jest.advanceTimersByTimeAsync(100)

        const result = await promise
        expect(result).toBe('success')
      })

      it('does not retry non-retryable errors (validation)', async () => {
        const fn = jest.fn(async () => {
          throw new Error('Invalid email format')
        })

        const promise = withRetry(fn, { maxRetries: 3, baseDelay: 100 })

        await jest.advanceTimersByTimeAsync(0)

        await expect(promise).rejects.toThrow('Invalid email format')
        expect(fn).toHaveBeenCalledTimes(1) // No retries
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'retry.non_retryable' }),
          expect.any(String)
        )
      })

      it('does not retry 4xx client errors', async () => {
        const fn = jest.fn(async () => {
          const error = new Error('Bad Request') as Error & { statusCode: number }
          error.statusCode = 400
          throw error
        })

        const promise = withRetry(fn, { maxRetries: 3, baseDelay: 100 })

        await jest.advanceTimersByTimeAsync(0)

        await expect(promise).rejects.toThrow('Bad Request')
        expect(fn).toHaveBeenCalledTimes(1)
      })

      it('respects custom isRetryable function', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts < 2) {
            throw new Error('CUSTOM_RETRYABLE')
          }
          return 'success'
        })

        const isRetryable = (error: Error) => error.message === 'CUSTOM_RETRYABLE'

        const promise = withRetry(fn, {
          maxRetries: 2,
          baseDelay: 100,
          jitter: false,
          isRetryable,
        })

        await jest.advanceTimersByTimeAsync(0)
        await jest.advanceTimersByTimeAsync(100)

        const result = await promise
        expect(result).toBe('success')
      })
    })

    describe('TEST-001-03: Max retry exhaustion', () => {
      it('fails after maxRetries attempts', async () => {
        const fn = jest.fn(async () => {
          throw new Error('ECONNRESET')
        })

        const promise = withRetry(fn, {
          maxRetries: 3,
          baseDelay: 100,
          jitter: false,
          operationName: 'test_exhaustion',
        })

        await jest.advanceTimersByTimeAsync(0)
        await jest.advanceTimersByTimeAsync(100)
        await jest.advanceTimersByTimeAsync(200)
        await jest.advanceTimersByTimeAsync(400)

        await expect(promise).rejects.toThrow('ECONNRESET')
        expect(fn).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'retry.exhausted',
            operation: 'test_exhaustion',
            attempts: 4,
          }),
          expect.stringContaining('failed after 4 attempts')
        )
      })

      it('logs success on retry after initial failure', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts < 2) {
            throw new Error('ECONNRESET')
          }
          return 'success'
        })

        const promise = withRetry(fn, {
          maxRetries: 3,
          baseDelay: 100,
          jitter: false,
          operationName: 'test_success_after_retry',
        })

        await jest.advanceTimersByTimeAsync(0)
        await jest.advanceTimersByTimeAsync(100)

        await promise
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'retry.success',
            operation: 'test_success_after_retry',
            attempt: 2,
          }),
          expect.stringContaining('succeeded on attempt 2')
        )
      })
    })

    describe('TEST-001-04: Success after N retries', () => {
      it('succeeds on first attempt without logging', async () => {
        const fn = jest.fn(async () => 'success')

        const result = await withRetry(fn, { maxRetries: 3 })

        expect(result).toBe('success')
        expect(fn).toHaveBeenCalledTimes(1)
        expect(logger.info).not.toHaveBeenCalled()
      })

      it('succeeds on second attempt after one retry', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts === 1) {
            throw new Error('ETIMEDOUT')
          }
          return 'success'
        })

        const promise = withRetry(fn, { maxRetries: 3, baseDelay: 100, jitter: false })

        await jest.advanceTimersByTimeAsync(0)
        await jest.advanceTimersByTimeAsync(100)

        const result = await promise
        expect(result).toBe('success')
        expect(fn).toHaveBeenCalledTimes(2)
      })

      it('succeeds on final retry attempt', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts < 4) {
            throw new Error('ECONNRESET')
          }
          return 'success'
        })

        const promise = withRetry(fn, { maxRetries: 3, baseDelay: 100, jitter: false })

        await jest.advanceTimersByTimeAsync(0)
        await jest.advanceTimersByTimeAsync(100)
        await jest.advanceTimersByTimeAsync(200)
        await jest.advanceTimersByTimeAsync(400)

        const result = await promise
        expect(result).toBe('success')
        expect(fn).toHaveBeenCalledTimes(4)
      })
    })
  })

  describe('makeRetryable', () => {
    it('creates a retryable function wrapper', async () => {
      const originalFn = jest.fn(async (value: number) => value * 2)

      const retryableFn = makeRetryable(originalFn, {
        maxRetries: 2,
        baseDelay: 100,
        jitter: false,
      })

      const result = await retryableFn(5)

      expect(result).toBe(10)
      expect(originalFn).toHaveBeenCalledWith(5)
    })

    it('retries wrapped function on failure', async () => {
      let attempts = 0
      const originalFn = jest.fn(async (value: number) => {
        attempts++
        if (attempts < 2) {
          throw new Error('ECONNRESET')
        }
        return value * 2
      })

      const retryableFn = makeRetryable(originalFn, {
        maxRetries: 2,
        baseDelay: 100,
        jitter: false,
      })

      const promise = retryableFn(5)

      await jest.advanceTimersByTimeAsync(0)
      await jest.advanceTimersByTimeAsync(100)

      const result = await promise
      expect(result).toBe(10)
      expect(originalFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('withTimeout', () => {
    describe('TEST-001-05: Timeout functionality', () => {
      it('completes successfully before timeout', async () => {
        const fn = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500))
          return 'success'
        })

        const promise = withTimeout(fn, 1000, 'test_timeout')

        await jest.advanceTimersByTimeAsync(500)

        const result = await promise
        expect(result).toBe('success')
        expect(logger.error).not.toHaveBeenCalled()
      })

      it('throws TimeoutError when operation exceeds timeout', async () => {
        const fn = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return 'success'
        })

        const promise = withTimeout(fn, 1000, 'test_timeout')

        await jest.advanceTimersByTimeAsync(1000)

        await expect(promise).rejects.toThrow('test_timeout timed out after 1000ms')

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'timeout',
            operation: 'test_timeout',
            timeout: 1000,
          }),
          expect.stringContaining('timed out after 1000ms')
        )
      })

      it('creates error with TimeoutError name', async () => {
        const fn = jest.fn(
          async () =>
            new Promise((resolve) => {
              setTimeout(resolve, 2000)
            })
        )

        const promise = withTimeout(fn, 1000, 'test')

        await jest.advanceTimersByTimeAsync(1000)

        await expect(promise).rejects.toThrow()

        try {
          await promise
        } catch (error) {
          expect((error as Error).name).toBe('TimeoutError')
        }
      })

      it('clears timeout on successful completion', async () => {
        const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

        const fn = jest.fn(async () => 'success')

        await withTimeout(fn, 1000, 'test')

        expect(clearTimeoutSpy).toHaveBeenCalled()
        clearTimeoutSpy.mockRestore()
      })

      it('clears timeout on error', async () => {
        const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

        const fn = jest.fn(async () => {
          throw new Error('Immediate failure')
        })

        try {
          await withTimeout(fn, 1000, 'test')
        } catch {
          /* Expected */
        }

        expect(clearTimeoutSpy).toHaveBeenCalled()
        clearTimeoutSpy.mockRestore()
      })
    })
  })

  describe('withRetryAndTimeout', () => {
    describe('TEST-001-06: Combined retry + timeout behavior', () => {
      it('succeeds within timeout on first attempt', async () => {
        const fn = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return 'success'
        })

        const promise = withRetryAndTimeout(fn, 1000, {
          maxRetries: 2,
          baseDelay: 100,
          jitter: false,
          operationName: 'combined_test',
        })

        await jest.advanceTimersByTimeAsync(100)

        const result = await promise
        expect(result).toBe('success')
        expect(fn).toHaveBeenCalledTimes(1)
      })

      it('retries on timeout and succeeds', async () => {
        let attempts = 0
        const fn = jest.fn(async () => {
          attempts++
          if (attempts === 1) {
            // First attempt times out
            await new Promise((resolve) => setTimeout(resolve, 2000))
          } else {
            // Second attempt succeeds quickly
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
          return 'success'
        })

        const promise = withRetryAndTimeout(fn, 1000, {
          maxRetries: 2,
          baseDelay: 100,
          jitter: false,
          operationName: 'retry_timeout',
        })

        // First attempt times out after 1000ms
        await jest.advanceTimersByTimeAsync(1000)

        // Retry delay of 100ms
        await jest.advanceTimersByTimeAsync(100)

        // Second attempt completes in 100ms
        await jest.advanceTimersByTimeAsync(100)

        const result = await promise
        expect(result).toBe('success')
        expect(fn).toHaveBeenCalledTimes(2)
      })

      it('fails after all retries timeout', async () => {
        const fn = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return 'success'
        })

        const promise = withRetryAndTimeout(fn, 1000, {
          maxRetries: 2,
          baseDelay: 100,
          jitter: false,
          operationName: 'all_timeout',
        })

        // First attempt timeout
        await jest.advanceTimersByTimeAsync(1000)
        // First retry delay
        await jest.advanceTimersByTimeAsync(100)
        // Second attempt timeout
        await jest.advanceTimersByTimeAsync(1000)
        // Second retry delay
        await jest.advanceTimersByTimeAsync(200)
        // Third attempt timeout
        await jest.advanceTimersByTimeAsync(1000)

        await expect(promise).rejects.toThrow('all_timeout timed out after 1000ms')
        expect(fn).toHaveBeenCalledTimes(3)
      })

      it('uses operation name from retry options', async () => {
        const fn = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
        })

        const promise = withRetryAndTimeout(fn, 1000, {
          maxRetries: 1,
          baseDelay: 100,
          jitter: false,
          operationName: 'custom_op_name',
        })

        await jest.advanceTimersByTimeAsync(1000)
        await jest.advanceTimersByTimeAsync(100)
        await jest.advanceTimersByTimeAsync(1000)

        await expect(promise).rejects.toThrow('custom_op_name timed out after 1000ms')
      })
    })
  })
})
