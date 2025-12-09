import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  withSubscriptionCheck,
  checkPremiumFeature,
  recordApiUsage,
  withWebhookAuth,
} from './subscription-middleware'
import { getUser } from '@/lib/auth/get-user'
import { prisma } from '@/lib/prisma'
import { BillingService } from '@/lib/billing'
import { SubscriptionService } from '@/lib/subscription'
import { NextRequest, NextResponse } from 'next/server'

// Mock dependencies
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
    usageRecord: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/billing', () => ({
  BillingService: {
    validateWebhookSignature: vi.fn(),
  },
}))

vi.mock('@/lib/subscription', () => ({
  SubscriptionService: {
    getPlanFeatures: vi.fn(),
    getCurrentUsage: vi.fn(),
    canPerformAction: vi.fn(),
    recordUsage: vi.fn(),
  },
}))

// Mock Next.js response
vi.mock('next/server', () => {
  const actual = vi.importActual('next/server')
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

const mockGetUser = getUser as vi.Mock
const mockPrismaOrg = prisma.organization.findUnique as vi.Mock
const mockPrismaUsage = prisma.usageRecord.create as vi.Mock
const mockValidateSignature = BillingService.validateWebhookSignature as vi.Mock
const mockGetPlanFeatures = SubscriptionService.getPlanFeatures as vi.Mock
const mockGetCurrentUsage = SubscriptionService.getCurrentUsage as vi.Mock
const mockCanPerformAction = SubscriptionService.canPerformAction as vi.Mock
const mockRecordUsage = SubscriptionService.recordUsage as vi.Mock

describe('withSubscriptionCheck', () => {
  const mockHandler = vi.fn()

  const createRequest = (params: Record<string, string> = {}) =>
    ({
      params,
    }) as unknown as NextRequest

  beforeEach(() => {
    vi.clearAllMocks()
    mockHandler.mockImplementation(async () => NextResponse.json({ success: true }))
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null)

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
    mockGetUser.mockResolvedValueOnce({ id: 'user_1' })
    mockPrismaOrg.mockResolvedValueOnce(null)

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'maxProjects',
      getOrganizationId: () => 'org_1',
    })
    const response = await middleware(createRequest({ id: 'org_1' }))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('Organization not found')
  })

  it('returns 403 when user lacks access', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_1' })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_1',
      members: [], // User not in members
    })

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'maxProjects',
      getOrganizationId: () => 'org_1',
    })
    const response = await middleware(createRequest({ id: 'org_1' }))
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 402 when subscription limit exceeded', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_1' })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_1',
      ownerId: 'user_1',
      members: [{ userId: 'user_1' }],
    })

    mockGetPlanFeatures.mockResolvedValueOnce({
      maxProjects: 1,
    })
    mockGetCurrentUsage.mockResolvedValueOnce({
      projects: 2,
    })
    mockCanPerformAction.mockResolvedValueOnce(false)

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'maxProjects',
      action: 'create',
      getOrganizationId: () => 'org_1',
    })
    const response = await middleware(createRequest({ id: 'org_1' }))
    const json = await response.json()

    expect(response.status).toBe(402)
    expect(json.error).toBe('Subscription limit exceeded')
    expect(json.details.upgradeRequired).toBe(true)
  })

  it('returns 402 for unavailable premium features', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_1' })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_1',
      ownerId: 'user_1',
      members: [{ userId: 'user_1' }],
    })

    mockGetPlanFeatures.mockResolvedValueOnce({
      prioritySupport: false,
    })
    mockGetCurrentUsage.mockResolvedValueOnce({})
    mockCanPerformAction.mockResolvedValueOnce(true) // Bypass limit check

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'prioritySupport',
      getOrganizationId: () => 'org_1',
    })
    const response = await middleware(createRequest({ id: 'org_1' }))
    const json = await response.json()

    expect(response.status).toBe(402)
    expect(json.error).toContain('not available')
  })

  it('calls handler when checks pass', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_1' })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_1',
      ownerId: 'user_1',
      members: [{ userId: 'user_1' }],
    })

    mockGetPlanFeatures.mockResolvedValueOnce({
      maxProjects: 5,
    })
    mockGetCurrentUsage.mockResolvedValueOnce({
      projects: 1,
    })
    mockCanPerformAction.mockResolvedValueOnce(true)

    const middleware = await withSubscriptionCheck(mockHandler, {
      feature: 'maxProjects',
      getOrganizationId: () => 'org_1',
    })
    await middleware(createRequest({ id: 'org_1' }))

    expect(mockHandler).toHaveBeenCalled()
  })
})

describe('recordApiUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records usage successfully', async () => {
    mockPrismaUsage.mockResolvedValueOnce(undefined)

    await recordApiUsage('org_123', 'key_456', 'proj_789')

    expect(mockRecordUsage).toHaveBeenCalledWith('api_calls', 1, 'proj_789', 'key_456')
  })

  it('handles errors gracefully', async () => {
    mockRecordUsage.mockRejectedValueOnce(new Error('Recording failed'))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Should not throw
    await expect(recordApiUsage('org_123')).resolves.not.toThrow()

    expect(errorSpy).toHaveBeenCalledWith('Failed to record API usage:', expect.any(Error))

    errorSpy.mockRestore()
  })
})

describe('checkPremiumFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkPremiumFeature('org_123', 'analytics')

    expect(result).toBe(false)

    errorSpy.mockRestore()
  })
})

describe('withWebhookAuth', () => {
  const mockHandler = vi.fn()
  const createRequest = (headers: Record<string, string> = {}): NextRequest => {
    const headerMap = new Map(Object.entries(headers))
    return {
      headers: {
        get: (key: string) => headerMap.get(key) || null,
      },
      text: async () => 'payload',
    } as unknown as NextRequest
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockHandler.mockResolvedValue({
      json: async () => ({ success: true }),
      status: 200,
    })
  })

  it('returns 401 for invalid signature', async () => {
    mockValidateSignature.mockReturnValue(false)

    const middleware = withWebhookAuth(mockHandler, {
      webhookSecret: 'secret',
      validateSignature: () => false,
    })
    const response = await middleware(createRequest({ 'stripe-signature': 'sig' }))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Invalid webhook signature')
  })

  it('calls handler for valid signature', async () => {
    mockValidateSignature.mockReturnValue(true)

    const middleware = withWebhookAuth(mockHandler, {
      webhookSecret: 'secret',
      validateSignature: () => true,
    })
    await middleware(createRequest({ 'stripe-signature': 'sig' }))

    expect(mockHandler).toHaveBeenCalled()
  })

  it('handles validation errors', async () => {
    const middleware = withWebhookAuth(mockHandler, {
      webhookSecret: 'secret',
      validateSignature: () => {
        throw new Error('Validation error')
      },
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await middleware(createRequest({ 'stripe-signature': 'sig' }))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Webhook authentication failed')

    errorSpy.mockRestore()
  })
})
