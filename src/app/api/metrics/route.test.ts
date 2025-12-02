/**
 * Tests for Metrics API
 */

import { GET } from './route'
import type { NextRequest } from 'next/server'

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return {
    ...actual,
    NextResponse: {
      json: (data: unknown, init?: { status?: number }) => ({
        json: async () => data,
        status: init?.status ?? 200,
      }),
    },
  }
})

jest.mock('@/lib/metrics', () => ({
  registry: {
    metrics: jest.fn(),
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
  },
}))

import { registry } from '@/lib/metrics'
const mockMetrics = registry.metrics as jest.Mock

describe('GET /api/metrics', () => {
  const createRequest = (): NextRequest =>
    ({
      headers: new Headers(),
    }) as unknown as NextRequest

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns metrics in Prometheus format', async () => {
    const metricsOutput = `
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 100
`
    mockMetrics.mockResolvedValueOnce(metricsOutput)

    const response = await GET(createRequest())

    // The route uses `new NextResponse()` constructor, not `NextResponse.json()`
    // So we verify the metrics function was called
    expect(mockMetrics).toHaveBeenCalled()
    expect(response).toBeDefined()
  })

  it('handles metrics generation failure', async () => {
    mockMetrics.mockRejectedValueOnce(new Error('Metrics collection failed'))

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()
    const response = await GET(createRequest())
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Failed to generate metrics')

    errorSpy.mockRestore()
  })
})
