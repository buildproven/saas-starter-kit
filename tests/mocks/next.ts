/**
 * Next.js Mock Types for Testing
 */
import { vi } from 'vitest'

// Mock NextResponse that works as both a class and has static methods
export class MockNextResponse extends Response {
  static json(body: unknown, init?: globalThis.ResponseInit) {
    const response = new Response(JSON.stringify(body), {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...init?.headers,
      },
    })
    // Add helper for tests to easily get the JSON data
    ;(response as MockNextResponse & { _body: unknown })._body = body
    return response
  }

  static redirect(url: string | URL, status = 307) {
    return new Response(null, {
      status,
      headers: { Location: url.toString() },
    })
  }

  static rewrite(url: string | URL) {
    return new Response(null, {
      headers: { 'x-middleware-rewrite': url.toString() },
    })
  }

  static next() {
    return new Response(null, {
      headers: { 'x-middleware-next': '1' },
    })
  }
}

// Helper to create a mock NextRequest
export function createMockRequest(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: unknown
  } = {}
) {
  const { method = 'GET', headers = {}, body } = options
  const absoluteUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`

  const request = new Request(absoluteUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  // Add NextRequest-like properties
  return Object.assign(request, {
    nextUrl: new URL(absoluteUrl),
    geo: {},
    ip: '127.0.0.1',
    cookies: {
      get: vi.fn(),
      getAll: vi.fn(() => []),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(() => false),
    },
  })
}

// Type for the mock request
export type MockRequest = ReturnType<typeof createMockRequest>
