/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/router', () => require('next-router-mock'))
jest.mock('next/navigation', () => require('next-router-mock'))

// Mock Web APIs for Node.js environment
const { ReadableStream, WritableStream, TransformStream } = require('node:stream/web')
const { TextEncoder, TextDecoder } = require('node:util')

Object.defineProperties(global, {
  ReadableStream: { value: ReadableStream },
  WritableStream: { value: WritableStream },
  TransformStream: { value: TransformStream },
  TextEncoder: { value: TextEncoder },
  TextDecoder: { value: TextDecoder },
  Request: {
    value: class Request {
      url: string
      method: string
      headers: Headers
      _body: any

      constructor(input: string, init: any = {}) {
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
  },
  Response: {
    value: class Response {
      status: number
      ok: boolean
      headers: Headers
      _body: any

      constructor(body: any, init: any = {}) {
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
    },
  },
  Headers: {
    value: class Headers {
      _headers: Map<string, any>

      constructor(init: any = {}) {
        this._headers = new Map()
        if (init) {
          Object.entries(init).forEach(([key, value]) => {
            this._headers.set(key.toLowerCase(), value)
          })
        }
      }

      get(name: string) {
        return this._headers.get(name.toLowerCase())
      }

      set(name: string, value: any) {
        this._headers.set(name.toLowerCase(), value)
      }
    },
  },
})
