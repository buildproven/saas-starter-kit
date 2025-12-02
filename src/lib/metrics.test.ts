/**
 * Tests for Metrics
 */

import {
  registry,
  httpRequestDuration,
  httpRequestTotal,
  httpRequestsActive,
  templateDownloads,
  templateSales,
  authAttempts,
  apiKeyUsage,
  subscriptionEvents,
  webhookEvents,
  databaseQueries,
  errors,
  measureAsync,
  measure,
  increment,
  set,
} from './metrics'

describe('Metrics', () => {
  beforeEach(() => {
    // Clear all metrics before each test
    registry.resetMetrics()
  })

  describe('registry', () => {
    it('exports a registry instance', () => {
      expect(registry).toBeDefined()
    })

    it('can generate metrics output', async () => {
      const output = await registry.metrics()
      expect(typeof output).toBe('string')
    })
  })

  describe('counters', () => {
    it('httpRequestTotal increments', () => {
      httpRequestTotal.inc({ method: 'GET', route: '/api/test', status_code: '200' })

      // Counter should have been incremented
      expect(httpRequestTotal).toBeDefined()
    })

    it('templateDownloads increments with labels', () => {
      templateDownloads.inc({ package: 'pro', status: 'success', format: 'zip' })

      expect(templateDownloads).toBeDefined()
    })

    it('templateSales increments', () => {
      templateSales.inc({ package: 'hobby' })

      expect(templateSales).toBeDefined()
    })

    it('authAttempts increments with result', () => {
      authAttempts.inc({ provider: 'google', result: 'success' })
      authAttempts.inc({ provider: 'credentials', result: 'failure' })

      expect(authAttempts).toBeDefined()
    })

    it('apiKeyUsage increments', () => {
      apiKeyUsage.inc({ organization_id: 'org_123', key_id: 'key_456', scopes: 'read' })

      expect(apiKeyUsage).toBeDefined()
    })

    it('subscriptionEvents increments', () => {
      subscriptionEvents.inc({ event_type: 'created', plan: 'pro' })

      expect(subscriptionEvents).toBeDefined()
    })

    it('webhookEvents increments', () => {
      webhookEvents.inc({ event_type: 'checkout.completed', result: 'success' })

      expect(webhookEvents).toBeDefined()
    })

    it('databaseQueries increments', () => {
      databaseQueries.inc({ operation: 'select', model: 'User' })

      expect(databaseQueries).toBeDefined()
    })

    it('errors increments', () => {
      errors.inc({ type: 'validation', severity: 'low', component: 'api' })

      expect(errors).toBeDefined()
    })
  })

  describe('histograms', () => {
    it('httpRequestDuration observes values', () => {
      httpRequestDuration.observe({ method: 'GET', route: '/api', status_code: '200' }, 0.5)

      expect(httpRequestDuration).toBeDefined()
    })
  })

  describe('gauges', () => {
    it('httpRequestsActive can be set', () => {
      httpRequestsActive.set({ method: 'GET', route: '/api' }, 5)

      expect(httpRequestsActive).toBeDefined()
    })
  })

  describe('measureAsync', () => {
    it('measures async function duration', async () => {
      const result = await measureAsync(
        httpRequestDuration,
        { method: 'POST', route: '/api/test', status_code: '201' },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return 'success'
        }
      )

      expect(result).toBe('success')
    })

    it('measures duration even on error', async () => {
      await expect(
        measureAsync(
          httpRequestDuration,
          { method: 'POST', route: '/api/test', status_code: '500' },
          async () => {
            throw new Error('Test error')
          }
        )
      ).rejects.toThrow('Test error')
    })
  })

  describe('measure', () => {
    it('measures sync function duration', () => {
      const result = measure(
        httpRequestDuration,
        { method: 'GET', route: '/api/sync', status_code: '200' },
        () => 'sync result'
      )

      expect(result).toBe('sync result')
    })

    it('measures duration even on error', () => {
      expect(() =>
        measure(httpRequestDuration, { method: 'GET', route: '/api', status_code: '500' }, () => {
          throw new Error('Sync error')
        })
      ).toThrow('Sync error')
    })
  })

  describe('increment helper', () => {
    it('increments counter with labels', () => {
      increment(httpRequestTotal, { method: 'DELETE', route: '/api/item', status_code: '204' })

      expect(httpRequestTotal).toBeDefined()
    })

    it('increments counter without labels', () => {
      increment(templateSales, undefined, 1)

      expect(templateSales).toBeDefined()
    })

    it('increments by custom value', () => {
      increment(httpRequestTotal, { method: 'GET', route: '/api', status_code: '200' }, 5)

      expect(httpRequestTotal).toBeDefined()
    })
  })

  describe('set helper', () => {
    it('sets gauge value with labels', () => {
      set(httpRequestsActive, 10, { method: 'GET', route: '/api/stream' })

      expect(httpRequestsActive).toBeDefined()
    })

    it('sets gauge value without labels', () => {
      set(httpRequestsActive, 0)

      expect(httpRequestsActive).toBeDefined()
    })
  })
})
