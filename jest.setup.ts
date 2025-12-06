import '@testing-library/jest-dom'
import { toHaveNoViolations } from 'jest-axe'
import { ReadableStream, WritableStream, TransformStream } from 'node:stream/web'
import { TextEncoder, TextDecoder } from 'node:util'
import { expect, jest } from '@jest/globals'

expect.extend(toHaveNoViolations)

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_1234567890abcdef'
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret'
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_1234567890abcdef'

const stripePriceEnvDefaults: Record<string, string> = {
  STRIPE_PRICE_STARTER_MONTHLY: 'price_test_starter_monthly',
  STRIPE_PRICE_STARTER_YEARLY: 'price_test_starter_yearly',
  STRIPE_PRICE_PRO_MONTHLY: 'price_test_pro_monthly',
  STRIPE_PRICE_PRO_YEARLY: 'price_test_pro_yearly',
  STRIPE_PRICE_ENTERPRISE_MONTHLY: 'price_test_enterprise_monthly',
  STRIPE_PRICE_ENTERPRISE_YEARLY: 'price_test_enterprise_yearly',
}

Object.entries(stripePriceEnvDefaults).forEach(([key, value]) => {
  if (!process.env[key]) {
    process.env[key] = value
  }
})

// Mock Next.js router
jest.mock('next/router', async () => import('next-router-mock'))
jest.mock('next/navigation', async () => import('next-router-mock'))

// Mock Web APIs for Node.js environment

Object.defineProperties(global, {
  ReadableStream: { value: global.ReadableStream || ReadableStream },
  WritableStream: { value: global.WritableStream || WritableStream },
  TransformStream: { value: global.TransformStream || TransformStream },
  TextEncoder: { value: global.TextEncoder || TextEncoder },
  TextDecoder: { value: global.TextDecoder || TextDecoder },
})

// For environments lacking fetch globals, provide minimal fallbacks
if (typeof global.Request === 'undefined') {
  Object.defineProperty(global, 'Request', {
    value: class Request {
      url: string
      method: string
      headers: Headers
      _body: unknown

      constructor(input: string, init: globalThis.RequestInit = {}) {
        this.url = input
        this.method = init.method || 'GET'
        this.headers = new Headers(init.headers)
        this._body = init.body
      }

      async json() {
        if (this._body && typeof this._body === 'string') {
          return JSON.parse(this._body)
        }
        return this._body || {}
      }
    },
  })
}

if (typeof global.Response === 'undefined') {
  Object.defineProperty(global, 'Response', {
    value: class Response {
      status: number
      ok: boolean
      headers: Headers
      _body: unknown

      constructor(body?: globalThis.BodyInit | null, init: globalThis.ResponseInit = {}) {
        this.status = init.status || 200
        this.ok = this.status >= 200 && this.status < 300
        this.headers = new Headers(init.headers)
        this._body = body
      }

      async json() {
        if (typeof this._body === 'string') {
          return JSON.parse(this._body)
        }
        return this._body
      }

      static json(body: unknown, init: globalThis.ResponseInit = {}) {
        const headers = new Headers(init.headers)
        if (!headers.get('content-type')) {
          headers.set('content-type', 'application/json')
        }
        return new Response(JSON.stringify(body), { ...init, headers })
      }
    },
  })
}

if (typeof global.Headers === 'undefined') {
  Object.defineProperty(global, 'Headers', {
    value: class Headers {
      _headers: Map<string, string>

      constructor(init?: globalThis.HeadersInit) {
        this._headers = new Map()
        if (init) {
          Object.entries(init).forEach(([key, value]) => {
            this._headers.set(key.toLowerCase(), String(value))
          })
        }
      }

      get(name: string) {
        return this._headers.get(name.toLowerCase())
      }

      set(name: string, value: string) {
        this._headers.set(name.toLowerCase(), value)
      }
    },
  })
}

if (typeof global.setImmediate === 'undefined') {
  // Minimal setImmediate polyfill for libraries that expect it (e.g., archiver)
  Object.defineProperty(global, 'setImmediate', {
    value: (fn: (...args: unknown[]) => void, ...args: unknown[]) => setTimeout(fn, 0, ...args),
  })
}

if (typeof global.clearImmediate === 'undefined') {
  Object.defineProperty(global, 'clearImmediate', {
    value: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  })
}

// Avoid unhandled rejection noise in tests that assert on rejections
process.on('unhandledRejection', () => {})
