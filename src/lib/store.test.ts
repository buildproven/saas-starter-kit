import { useAppStore } from './store'
import { renderHook, act } from '@testing-library/react'

// Mock localStorage for testing persistence
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('App Store', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Clear localStorage mock
    localStorageMock.getItem.mockReturnValue(null)

    // Reset store to initial state before each test
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.reset()
    })
  })

  it('has correct initial state', () => {
    const { result } = renderHook(() => useAppStore())

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.organizations).toEqual([])
    expect(result.current.currentOrganization).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.apiKeys).toEqual([])
    expect(result.current.sidebarOpen).toBe(false)
    expect(result.current.theme).toBe('light')
    expect(result.current.notifications).toEqual([])
  })

  describe('setUser', () => {
    it('sets user and marks as authenticated when user is provided', () => {
      const { result } = renderHook(() => useAppStore())
      const testUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
      }

      act(() => {
        result.current.setUser(testUser)
      })

      expect(result.current.user).toEqual(testUser)
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('clears user and marks as unauthenticated when null is provided', () => {
      const { result } = renderHook(() => useAppStore())
      const testUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
      }

      // First set a user
      act(() => {
        result.current.setUser(testUser)
      })

      expect(result.current.isAuthenticated).toBe(true)

      // Then clear the user
      act(() => {
        result.current.setUser(null)
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  describe('toggleSidebar', () => {
    it('toggles sidebar state from false to true', () => {
      const { result } = renderHook(() => useAppStore())

      expect(result.current.sidebarOpen).toBe(false)

      act(() => {
        result.current.toggleSidebar()
      })

      expect(result.current.sidebarOpen).toBe(true)
    })

    it('toggles sidebar state from true to false', () => {
      const { result } = renderHook(() => useAppStore())

      // First set to true
      act(() => {
        result.current.toggleSidebar()
      })

      expect(result.current.sidebarOpen).toBe(true)

      // Then toggle back to false
      act(() => {
        result.current.toggleSidebar()
      })

      expect(result.current.sidebarOpen).toBe(false)
    })
  })

  describe('setTheme', () => {
    it('sets theme to dark', () => {
      const { result } = renderHook(() => useAppStore())

      act(() => {
        result.current.setTheme('dark')
      })

      expect(result.current.theme).toBe('dark')
    })

    it('sets theme to light', () => {
      const { result } = renderHook(() => useAppStore())

      // First set to dark
      act(() => {
        result.current.setTheme('dark')
      })

      // Then set to light
      act(() => {
        result.current.setTheme('light')
      })

      expect(result.current.theme).toBe('light')
    })
  })

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const { result } = renderHook(() => useAppStore())
      const testUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
      }

      // Modify all state
      act(() => {
        result.current.setUser(testUser)
        result.current.toggleSidebar()
        result.current.setTheme('dark')
      })

      // Verify state is changed
      expect(result.current.user).toEqual(testUser)
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.sidebarOpen).toBe(true)
      expect(result.current.theme).toBe('dark')

      // Reset
      act(() => {
        result.current.reset()
      })

      // Verify back to initial state
      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.organizations).toEqual([])
      expect(result.current.currentOrganization).toBeNull()
      expect(result.current.apiKeys).toEqual([])
      expect(result.current.sidebarOpen).toBe(false)
      expect(result.current.theme).toBe('light')
      expect(result.current.notifications).toEqual([])
    })
  })

  describe('Organization Management', () => {
    it('sets organizations and auto-selects first as current', () => {
      const { result } = renderHook(() => useAppStore())
      const organizations = [
        {
          id: '1',
          name: 'Org 1',
          slug: 'org-1',
          role: 'OWNER' as const,
        },
        {
          id: '2',
          name: 'Org 2',
          slug: 'org-2',
          role: 'MEMBER' as const,
        },
      ]

      act(() => {
        result.current.setOrganizations(organizations)
      })

      expect(result.current.organizations).toEqual(organizations)
      expect(result.current.currentOrganization).toEqual(organizations[0])
    })

    it('updates organization correctly', () => {
      const { result } = renderHook(() => useAppStore())
      const organizations = [
        {
          id: '1',
          name: 'Org 1',
          slug: 'org-1',
          role: 'OWNER' as const,
        },
      ]

      act(() => {
        result.current.setOrganizations(organizations)
      })

      act(() => {
        result.current.updateOrganization('1', { name: 'Updated Org' })
      })

      expect(result.current.organizations[0]).toBeDefined()
      expect(result.current.organizations[0]?.name).toBe('Updated Org')
      expect(result.current.currentOrganization?.name).toBe('Updated Org')
    })
  })

  describe('API Key Management', () => {
    it('manages API keys correctly', () => {
      const { result } = renderHook(() => useAppStore())
      const apiKeys = [
        {
          id: '1',
          name: 'Test Key',
          lastUsedAt: '2023-01-01',
        },
      ]

      act(() => {
        result.current.setApiKeys(apiKeys)
      })

      expect(result.current.apiKeys).toEqual(apiKeys)

      // Add new key
      const newKey = {
        id: '2',
        name: 'New Key',
      }

      act(() => {
        result.current.addApiKey(newKey)
      })

      expect(result.current.apiKeys).toHaveLength(2)
      expect(result.current.apiKeys).toContain(newKey)

      // Remove key
      act(() => {
        result.current.removeApiKey('1')
      })

      expect(result.current.apiKeys).toHaveLength(1)
      expect(result.current.apiKeys[0]).toEqual(newKey)
    })
  })

  describe('Notifications', () => {
    it('adds and removes notifications correctly', () => {
      const { result } = renderHook(() => useAppStore())

      act(() => {
        result.current.addNotification({
          type: 'success',
          title: 'Test notification',
          message: 'Test message',
        })
      })

      expect(result.current.notifications).toHaveLength(1)
      const [notification] = result.current.notifications
      expect(notification).toBeDefined()
      expect(notification).toMatchObject({
        type: 'success',
        title: 'Test notification',
        message: 'Test message',
      })

      const notificationId = notification?.id
      expect(notificationId).toBeDefined()

      act(() => {
        result.current.removeNotification(notificationId as string)
      })

      expect(result.current.notifications).toHaveLength(0)
    })

    it('clears all notifications', () => {
      const { result } = renderHook(() => useAppStore())

      act(() => {
        result.current.addNotification({
          type: 'success',
          title: 'Test 1',
        })
        result.current.addNotification({
          type: 'error',
          title: 'Test 2',
        })
      })

      expect(result.current.notifications).toHaveLength(2)

      act(() => {
        result.current.clearNotifications()
      })

      expect(result.current.notifications).toHaveLength(0)
    })
  })

  describe('Persistence', () => {
    it('attempts to persist state changes', () => {
      const { result } = renderHook(() => useAppStore())
      const testUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
      }

      act(() => {
        result.current.setUser(testUser)
        result.current.setTheme('dark')
      })

      // Zustand with persist should call localStorage.setItem
      // We can't easily test the exact calls due to Zustand's internal implementation
      // but we can verify the store works correctly
      expect(result.current.user).toEqual(testUser)
      expect(result.current.theme).toBe('dark')
    })

    it('handles localStorage errors gracefully', () => {
      // Mock localStorage to throw an error
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded')
      })

      const { result } = renderHook(() => useAppStore())

      // Should not throw an error
      expect(() => {
        act(() => {
          result.current.setTheme('dark')
        })
      }).not.toThrow()

      expect(result.current.theme).toBe('dark')
    })
  })
})
