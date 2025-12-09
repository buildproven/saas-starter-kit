import 'vitest-axe/extend-expect'
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// React 19 compatibility: enable act environment
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// Setup Environment Variables
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_1234567890abcdef'
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret'
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_1234567890abcdef'

// Mock Next.js router and navigation
vi.mock('next/router', async () => await import('next-router-mock'))
vi.mock('next/navigation', async () => await import('next-router-mock'))

// Mock next/headers to fix "cookies was called outside a request scope"
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    getAll: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
  }),
  headers: () => ({
    get: vi.fn(),
  }),
}))

// Mock NextResponse to behave like a standard Response in tests if needed
// But usually we just use the native Response in tests.
// However, some code imports NextResponse.json()
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    NextResponse: class MockNextResponse extends Response {
      static json(body: unknown, init?: globalThis.ResponseInit) {
        return new Response(JSON.stringify(body), {
          ...init,
          headers: {
            'content-type': 'application/json',
            ...init?.headers,
          },
        })
      }
    },
  }
})

// Polyfills for Node.js environment (if JSDOM misses them)
import { TextEncoder, TextDecoder } from 'node:util'
import { ReadableStream, WritableStream, TransformStream } from 'node:stream/web'

Object.defineProperties(global, {
  TextEncoder: { value: TextEncoder },
  TextDecoder: { value: TextDecoder },
  ReadableStream: { value: ReadableStream },
  WritableStream: { value: WritableStream },
  TransformStream: { value: TransformStream },
})

// Mock HTMLCanvasElement.getContext to suppress jsdom warnings in a11y tests
// This is needed because axe-core tries to use canvas for icon ligature detection
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: [] })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => []),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext
