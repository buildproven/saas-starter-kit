/**
 * Tests for useStore hooks
 */

import { renderHook, act } from '@testing-library/react'
import { useAppStore } from '../../store'
import {
  useCurrentOrganization,
  useNotifications,
  useApiKeys,
  useUI,
  useOrganizations,
  useSessionSync,
} from '../useStore'

// Mock next-auth/react
const mockUseSession = vi.fn()
vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}))

// Reset store before each test
beforeEach(() => {
  const { reset } = useAppStore.getState()
  reset()
  mockUseSession.mockReturnValue({
    data: null,
    status: 'unauthenticated',
  })
})

describe('useSessionSync', () => {
  it('syncs session to store when authenticated', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { id: 'user_1', email: 'test@example.com', name: 'Test User' },
        expires: '2099-12-31',
      },
      status: 'authenticated',
    })

    const { result } = renderHook(() => useSessionSync())

    expect(result.current.status).toBe('authenticated')
    expect(result.current.session?.user?.email).toBe('test@example.com')
  })

  it('returns unauthenticated when no session', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    })

    const { result } = renderHook(() => useSessionSync())

    expect(result.current.status).toBe('unauthenticated')
    expect(result.current.session).toBeNull()
  })

  it('returns loading status when loading', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'loading',
    })

    const { result } = renderHook(() => useSessionSync())

    expect(result.current.status).toBe('loading')
  })
})

describe('useCurrentOrganization', () => {
  it('returns null when no organization set', () => {
    const { result } = renderHook(() => useCurrentOrganization())

    expect(result.current.organization).toBeNull()
    expect(result.current.hasActiveSubscription).toBe(false)
    expect(result.current.isTrialing).toBe(false)
    expect(result.current.subscriptionEnded).toBe(false)
    expect(result.current.isOwnerOrAdmin).toBe(false)
  })

  it('detects active subscription', () => {
    // Setup store first
    act(() => {
      useAppStore.getState().setCurrentOrganization({
        id: 'org_1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'OWNER',
        subscription: {
          status: 'ACTIVE',
          plan: 'pro',
          currentPeriodEnd: '2099-12-31',
        },
      })
    })

    const { result } = renderHook(() => useCurrentOrganization())

    expect(result.current.hasActiveSubscription).toBe(true)
    expect(result.current.isTrialing).toBe(false)
  })

  it('detects trialing subscription', () => {
    act(() => {
      useAppStore.getState().setCurrentOrganization({
        id: 'org_1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'OWNER',
        subscription: {
          status: 'TRIALING',
          plan: 'pro',
          currentPeriodEnd: '2099-12-31',
        },
      })
    })

    const { result } = renderHook(() => useCurrentOrganization())

    expect(result.current.isTrialing).toBe(true)
    expect(result.current.hasActiveSubscription).toBe(false)
  })

  it('detects ended subscription', () => {
    act(() => {
      useAppStore.getState().setCurrentOrganization({
        id: 'org_1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'MEMBER',
        subscription: {
          status: 'CANCELED',
          plan: 'starter',
          currentPeriodEnd: '2024-01-01',
        },
      })
    })

    const { result } = renderHook(() => useCurrentOrganization())

    expect(result.current.subscriptionEnded).toBe(true)
  })

  it('identifies owner role', () => {
    act(() => {
      useAppStore.getState().setCurrentOrganization({
        id: 'org_1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'OWNER',
      })
    })

    const { result } = renderHook(() => useCurrentOrganization())

    expect(result.current.isOwnerOrAdmin).toBe(true)
  })

  it('identifies admin role', () => {
    act(() => {
      useAppStore.getState().setCurrentOrganization({
        id: 'org_1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'ADMIN',
      })
    })

    const { result } = renderHook(() => useCurrentOrganization())

    expect(result.current.isOwnerOrAdmin).toBe(true)
  })

  it('canAccess returns false without subscription', () => {
    act(() => {
      useAppStore.getState().setCurrentOrganization({
        id: 'org_1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'MEMBER',
      })
    })

    const { result } = renderHook(() => useCurrentOrganization())

    expect(result.current.canAccess('feature')).toBe(false)
  })

  it('canAccess returns true with active subscription', () => {
    act(() => {
      useAppStore.getState().setCurrentOrganization({
        id: 'org_1',
        name: 'Test Org',
        slug: 'test-org',
        role: 'MEMBER',
        subscription: {
          status: 'ACTIVE',
          plan: 'pro',
          currentPeriodEnd: '2099-12-31',
        },
      })
    })

    const { result } = renderHook(() => useCurrentOrganization())

    expect(result.current.canAccess('feature')).toBe(true)
  })

  it('updates organization through hook', () => {
    act(() => {
      useAppStore.getState().setOrganizations([
        { id: 'org_1', name: 'Test Org', slug: 'test-org', role: 'OWNER' },
      ])
    })

    const { result } = renderHook(() => useCurrentOrganization())

    act(() => {
      result.current.updateOrganization('org_1', { name: 'Updated Name' })
    })

    expect(result.current.organization?.name).toBe('Updated Name')
  })
})

describe('useNotifications', () => {
  it('starts with empty notifications', () => {
    const { result } = renderHook(() => useNotifications())

    expect(result.current.notifications).toHaveLength(0)
  })

  it('adds success notification', () => {
    const { result } = renderHook(() => useNotifications())

    act(() => {
      result.current.showSuccess('Success!', 'Operation completed')
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].type).toBe('success')
    expect(result.current.notifications[0].title).toBe('Success!')
  })

  it('adds error notification', () => {
    const { result } = renderHook(() => useNotifications())

    act(() => {
      result.current.showError('Error!', 'Something went wrong')
    })

    expect(result.current.notifications[0].type).toBe('error')
  })

  it('adds warning notification', () => {
    const { result } = renderHook(() => useNotifications())

    act(() => {
      result.current.showWarning('Warning!')
    })

    expect(result.current.notifications[0].type).toBe('warning')
  })

  it('adds info notification', () => {
    const { result } = renderHook(() => useNotifications())

    act(() => {
      result.current.showInfo('Info')
    })

    expect(result.current.notifications[0].type).toBe('info')
  })

  it('removes notification by id', () => {
    const { result } = renderHook(() => useNotifications())

    act(() => {
      result.current.showInfo('Test')
    })

    const notificationId = result.current.notifications[0].id

    act(() => {
      result.current.removeNotification(notificationId)
    })

    expect(result.current.notifications).toHaveLength(0)
  })

  it('clears all notifications', () => {
    const { result } = renderHook(() => useNotifications())

    act(() => {
      result.current.showInfo('Test 1')
      result.current.showInfo('Test 2')
    })

    act(() => {
      result.current.clearNotifications()
    })

    expect(result.current.notifications).toHaveLength(0)
  })
})

describe('useApiKeys', () => {
  it('starts with empty api keys', () => {
    const { result } = renderHook(() => useApiKeys())

    expect(result.current.apiKeys).toHaveLength(0)
    expect(result.current.activeKeys).toHaveLength(0)
    expect(result.current.expiredKeys).toHaveLength(0)
  })

  it('sets api keys', () => {
    const { result } = renderHook(() => useApiKeys())

    act(() => {
      result.current.setApiKeys([
        { id: 'key_1', name: 'Key 1' },
        { id: 'key_2', name: 'Key 2' },
      ])
    })

    expect(result.current.apiKeys).toHaveLength(2)
  })

  it('adds api key', () => {
    const { result } = renderHook(() => useApiKeys())

    act(() => {
      result.current.addApiKey({ id: 'key_1', name: 'New Key' })
    })

    expect(result.current.apiKeys).toHaveLength(1)
    expect(result.current.apiKeys[0].name).toBe('New Key')
  })

  it('removes api key', () => {
    const { result } = renderHook(() => useApiKeys())

    act(() => {
      result.current.setApiKeys([
        { id: 'key_1', name: 'Key 1' },
        { id: 'key_2', name: 'Key 2' },
      ])
    })

    act(() => {
      result.current.removeApiKey('key_1')
    })

    expect(result.current.apiKeys).toHaveLength(1)
    expect(result.current.apiKeys[0].id).toBe('key_2')
  })

  it('filters active keys', () => {
    const { result } = renderHook(() => useApiKeys())
    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 1)
    const pastDate = new Date()
    pastDate.setFullYear(pastDate.getFullYear() - 1)

    act(() => {
      result.current.setApiKeys([
        { id: 'key_1', name: 'Active', expiresAt: futureDate.toISOString() },
        { id: 'key_2', name: 'Expired', expiresAt: pastDate.toISOString() },
        { id: 'key_3', name: 'No Expiry' },
      ])
    })

    expect(result.current.activeKeys).toHaveLength(2)
    expect(result.current.activeKeys.map((k) => k.name)).toContain('Active')
    expect(result.current.activeKeys.map((k) => k.name)).toContain('No Expiry')
  })

  it('filters expired keys', () => {
    const { result } = renderHook(() => useApiKeys())
    const pastDate = new Date()
    pastDate.setFullYear(pastDate.getFullYear() - 1)

    act(() => {
      result.current.setApiKeys([
        { id: 'key_1', name: 'Active' },
        { id: 'key_2', name: 'Expired', expiresAt: pastDate.toISOString() },
      ])
    })

    expect(result.current.expiredKeys).toHaveLength(1)
    expect(result.current.expiredKeys[0].name).toBe('Expired')
  })
})

describe('useUI', () => {
  it('starts with default values', () => {
    const { result } = renderHook(() => useUI())

    expect(result.current.sidebarOpen).toBe(false)
    expect(result.current.theme).toBe('light')
    expect(result.current.isLoading).toBe(false)
  })

  it('toggles sidebar', () => {
    const { result } = renderHook(() => useUI())

    act(() => {
      result.current.toggleSidebar()
    })

    expect(result.current.sidebarOpen).toBe(true)

    act(() => {
      result.current.toggleSidebar()
    })

    expect(result.current.sidebarOpen).toBe(false)
  })

  it('sets theme', () => {
    const { result } = renderHook(() => useUI())

    act(() => {
      result.current.setTheme('dark')
    })

    expect(result.current.theme).toBe('dark')
  })

  it('toggles theme', () => {
    const { result } = renderHook(() => useUI())

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.theme).toBe('dark')

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.theme).toBe('light')
  })

  it('sets loading state', () => {
    const { result } = renderHook(() => useUI())

    act(() => {
      result.current.setLoading(true)
    })

    expect(result.current.isLoading).toBe(true)
  })
})

describe('useOrganizations', () => {
  it('starts with empty organizations', () => {
    const { result } = renderHook(() => useOrganizations())

    expect(result.current.organizations).toHaveLength(0)
    expect(result.current.ownedOrganizations).toHaveLength(0)
    expect(result.current.memberOrganizations).toHaveLength(0)
  })

  it('sets organizations', () => {
    const { result } = renderHook(() => useOrganizations())

    act(() => {
      result.current.setOrganizations([
        { id: 'org_1', name: 'Org 1', slug: 'org-1', role: 'OWNER' },
        { id: 'org_2', name: 'Org 2', slug: 'org-2', role: 'MEMBER' },
      ])
    })

    expect(result.current.organizations).toHaveLength(2)
  })

  it('sets first organization as current when none selected', () => {
    const { result } = renderHook(() => useOrganizations())

    act(() => {
      result.current.setOrganizations([
        { id: 'org_1', name: 'Org 1', slug: 'org-1', role: 'OWNER' },
        { id: 'org_2', name: 'Org 2', slug: 'org-2', role: 'MEMBER' },
      ])
    })

    expect(result.current.currentOrganization?.id).toBe('org_1')
  })

  it('switches organization', () => {
    const { result } = renderHook(() => useOrganizations())

    act(() => {
      result.current.setOrganizations([
        { id: 'org_1', name: 'Org 1', slug: 'org-1', role: 'OWNER' },
        { id: 'org_2', name: 'Org 2', slug: 'org-2', role: 'MEMBER' },
      ])
    })

    act(() => {
      result.current.switchOrganization('org_2')
    })

    expect(result.current.currentOrganization?.id).toBe('org_2')
  })

  it('does not switch to non-existent organization', () => {
    const { result } = renderHook(() => useOrganizations())

    act(() => {
      result.current.setOrganizations([
        { id: 'org_1', name: 'Org 1', slug: 'org-1', role: 'OWNER' },
      ])
    })

    act(() => {
      result.current.switchOrganization('org_nonexistent')
    })

    expect(result.current.currentOrganization?.id).toBe('org_1')
  })

  it('filters owned organizations', () => {
    const { result } = renderHook(() => useOrganizations())

    act(() => {
      result.current.setOrganizations([
        { id: 'org_1', name: 'Org 1', slug: 'org-1', role: 'OWNER' },
        { id: 'org_2', name: 'Org 2', slug: 'org-2', role: 'MEMBER' },
        { id: 'org_3', name: 'Org 3', slug: 'org-3', role: 'OWNER' },
      ])
    })

    expect(result.current.ownedOrganizations).toHaveLength(2)
  })

  it('filters member organizations', () => {
    const { result } = renderHook(() => useOrganizations())

    act(() => {
      result.current.setOrganizations([
        { id: 'org_1', name: 'Org 1', slug: 'org-1', role: 'OWNER' },
        { id: 'org_2', name: 'Org 2', slug: 'org-2', role: 'MEMBER' },
        { id: 'org_3', name: 'Org 3', slug: 'org-3', role: 'ADMIN' },
      ])
    })

    expect(result.current.memberOrganizations).toHaveLength(2)
  })
})
