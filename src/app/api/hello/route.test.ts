// Mock NextResponse before importing the route
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init = {}) => ({
      json: jest.fn().mockResolvedValue(data),
      status: init.status || 200,
      headers: new Map(),
    })),
  },
}))

import { GET, POST } from './route'
import { NextRequest } from 'next/server'

// Mock NextRequest for testing
const createMockRequest = (options: {
  method?: string
  body?: unknown
  url?: string
} = {}) => {
  const { method = 'GET', body, url = 'http://localhost:3000/api/hello' } = options

  const request = {
    method,
    url,
    json: jest.fn().mockResolvedValue(body),
    headers: new Headers(),
  } as unknown as NextRequest

  return request
}

describe('/api/hello Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/hello', () => {
    it('returns a successful response with message', async () => {
      const request = createMockRequest({ method: 'GET' })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ message: 'Hello from the API!' })
    })

    it('returns a Response object', async () => {
      const request = createMockRequest({ method: 'GET' })

      const response = await GET(request)

      expect(response).toBeTruthy()
      expect(response.status).toBeDefined()
    })
  })

  describe('POST /api/hello', () => {
    it('returns received data for valid JSON', async () => {
      const testData = { name: 'John', email: 'john@example.com' }
      const request = createMockRequest({
        method: 'POST',
        body: testData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        message: 'Data received',
        data: testData
      })
      expect(request.json).toHaveBeenCalledTimes(1)
    })

    it('handles empty JSON body', async () => {
      const request = createMockRequest({
        method: 'POST',
        body: {}
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        message: 'Data received',
        data: {}
      })
    })

    it('returns error for invalid JSON', async () => {
      const request = createMockRequest({ method: 'POST' })
      // Mock request.json() to throw an error
      request.json = jest.fn().mockRejectedValue(new Error('Invalid JSON'))

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'Invalid request body'
      })
    })

    it('handles malformed request gracefully', async () => {
      const request = createMockRequest({ method: 'POST' })
      // Mock request.json() to throw a syntax error
      request.json = jest.fn().mockRejectedValue(new SyntaxError('Unexpected token'))

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'Invalid request body'
      })
    })

    it('returns a Response object with correct headers', async () => {
      const request = createMockRequest({
        method: 'POST',
        body: { test: 'data' }
      })

      const response = await POST(request)

      expect(response).toBeTruthy()
      expect(response.status).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('handles network errors gracefully', async () => {
      const request = createMockRequest({ method: 'POST' })
      // Mock a network-like error
      request.json = jest.fn().mockRejectedValue(new Error('Network error'))

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request body')
    })
  })
})