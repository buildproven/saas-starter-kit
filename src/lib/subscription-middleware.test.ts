/**
 * Tests for Subscription Middleware
 */

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

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/subscription', () => ({
  SubscriptionService: {
    getPlanFeatures: jest.fn(),
    getCurrentUsage: jest.fn(),
    canPerformAction: jest.fn(),
    recordUsage: jest.fn(),
  },
}))

import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'
import { SubscriptionService } from '@/lib/subscription'
import {
  withSubscriptionCheck,
  recordApiUsage,
  checkPremiumFeature,
  withWebhookAuth,
} from './subscription-middleware'

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrismaOrg = prisma.organization.findUnique as jest.Mock
const mockGetPlanFeatures = SubscriptionService.getPlanFeatures as jest.Mock
const mockGetCurrentUsage = SubscriptionService.getCurrentUsage as jest.Mock
const mockCanPerformAction = SubscriptionService.canPerformAction as jest.Mock
const mockRecordUsage = SubscriptionService.recordUsage as jest.Mock

describe('withSubscriptionCheck', () => {
  const mockHandler = jest.fn()
  const createRequest = (): NextRequest =>
    ({
      headers: new Headers(),
    }) as unknown as NextRequest

  beforeEach(() => {
    jest.clearAllMocks()
    mockHandler.mockResolvedValue({
      json: async () => ({ success: true }),
      status: 200,
    })
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null)

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'maxProjects',
      getOrganizationId: () => 'org_123',
    })

    const response = await middleware(createRequest())
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when organization not found', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockResolvedValueOnce(null)

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'maxProjects',
      getOrganizationId: () => 'org_123',
    })

    const response = await middleware(createRequest())
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('Organization not found')
  })

  it('returns 403 when user lacks access', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'other_user',
      members: [],
    })

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'maxProjects',
      getOrganizationId: () => 'org_123',
    })

    const response = await middleware(createRequest())
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 402 when subscription limit exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    })
    mockGetPlanFeatures.mockResolvedValueOnce({
      maxProjects: 5,
    })
    mockGetCurrentUsage.mockResolvedValueOnce({
      projects: 5,
    })
    mockCanPerformAction.mockResolvedValueOnce(false)

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'maxProjects',
      action: 'create',
      getOrganizationId: () => 'org_123',
    })

    const response = await middleware(createRequest())
    const json = await response.json()

    expect(response.status).toBe(402)
    expect(json.error).toBe('Subscription limit exceeded')
    expect(json.details.upgradeRequired).toBe(true)
  })

  it('returns 402 for unavailable premium features', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    })
    mockGetPlanFeatures.mockResolvedValueOnce({
      prioritySupport: false,
    })
    mockGetCurrentUsage.mockResolvedValueOnce({})
    // Skip the create action check by using 'read' action
    mockCanPerformAction.mockResolvedValueOnce(true)

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'prioritySupport',
      action: 'read', // Use read action to skip limit check and test feature check
      getOrganizationId: () => 'org_123',
    })

    const response = await middleware(createRequest())
    const json = await response.json()

    expect(response.status).toBe(402)
    expect(json.error).toContain('not available')
  })

  it('calls handler when checks pass', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    })
    mockGetPlanFeatures.mockResolvedValueOnce({
      maxProjects: 10,
    })
    mockGetCurrentUsage.mockResolvedValueOnce({
      projects: 3,
    })
    mockCanPerformAction.mockResolvedValueOnce(true)

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'maxProjects',
      getOrganizationId: () => 'org_123',
    })

    await middleware(createRequest())

    expect(mockHandler).toHaveBeenCalled()
  })
})

describe('recordApiUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('records usage successfully', async () => {
    mockRecordUsage.mockResolvedValueOnce(undefined)

    await recordApiUsage('org_123', 'key_456', 'proj_789')

    expect(mockRecordUsage).toHaveBeenCalledWith('api_calls', 1, 'proj_789', 'key_456')
  })

  it('handles errors gracefully', async () => {
    mockRecordUsage.mockRejectedValueOnce(new Error('Recording failed'))

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()

    // Should not throw
    await expect(recordApiUsage('org_123')).resolves.not.toThrow()

    expect(errorSpy).toHaveBeenCalledWith('Failed to record API usage:', expect.any(Error))

    errorSpy.mockRestore()
  })
})

describe('checkPremiumFeature', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns true when feature is available', async () => {
    mockGetPlanFeatures.mockResolvedValueOnce({
      prioritySupport: true,
    })

    const result = await checkPremiumFeature('org_123', 'prioritySupport')

    expect(result).toBe(true)
  })

  it('returns false when feature is unavailable', async () => {
    mockGetPlanFeatures.mockResolvedValueOnce({
      sso: false,
    })

    const result = await checkPremiumFeature('org_123', 'sso')

    expect(result).toBe(false)
  })

  it('returns false on error', async () => {
    mockGetPlanFeatures.mockRejectedValueOnce(new Error('Failed'))

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()
    const result = await checkPremiumFeature('org_123', 'analytics')

    expect(result).toBe(false)

    errorSpy.mockRestore()
  })
})

describe('withWebhookAuth', () => {
  const mockHandler = jest.fn()
  const createRequest = (headers: Record<string, string> = {}): NextRequest => {
    const headerMap = new Map(Object.entries(headers))
    return {
      headers: {
        get: (key: string) => headerMap.get(key) || null,
      },
    } as unknown as NextRequest
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockHandler.mockResolvedValue({
      json: async () => ({ success: true }),
      status: 200,
    })
  })

  it('returns 401 for invalid signature', async () => {
    const middleware = withWebhookAuth(mockHandler, {
      webhookSecret: 'secret',
      validateSignature: () => false,
    })

    const response = await middleware(createRequest())
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Invalid webhook signature')
  })

  it('calls handler for valid signature', async () => {
    const middleware = withWebhookAuth(mockHandler, {
      webhookSecret: 'secret',
      validateSignature: () => true,
    })

    await middleware(createRequest())

    expect(mockHandler).toHaveBeenCalled()
  })

  it('handles validation errors', async () => {
    const middleware = withWebhookAuth(mockHandler, {
      webhookSecret: 'secret',
      validateSignature: () => {
        throw new Error('Validation error')
      },
    })

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()
    const response = await middleware(createRequest())
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Webhook authentication failed')

    errorSpy.mockRestore()
  })
})
