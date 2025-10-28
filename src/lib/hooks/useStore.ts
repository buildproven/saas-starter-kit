import { useAppStore } from '../store'
import { useSession } from 'next-auth/react'
import { useEffect } from 'react'

// Hook to sync NextAuth session with Zustand store
export function useSessionSync() {
  const { data: session, status } = useSession()
  const setSession = useAppStore((state) => state.setSession)

  useEffect(() => {
    if (status !== 'loading') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSession(session as any)
    }
  }, [session, status, setSession])

  return { session, status }
}

// Hook for current organization with subscription info
export function useCurrentOrganization() {
  const currentOrganization = useAppStore((state) => state.currentOrganization)
  const setCurrentOrganization = useAppStore((state) => state.setCurrentOrganization)
  const updateOrganization = useAppStore((state) => state.updateOrganization)

  const hasActiveSubscription = currentOrganization?.subscription?.status === 'active'
  const isTrialing = currentOrganization?.subscription?.status === 'trialing'
  const subscriptionEnded = ['canceled', 'past_due', 'unpaid'].includes(
    currentOrganization?.subscription?.status || ''
  )

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const canAccess = (_feature: string) => {
    if (!currentOrganization?.subscription) return false

    // Add feature-based access control logic here
    // This would typically check the plan features against the feature parameter
    return hasActiveSubscription || isTrialing
  }

  const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(currentOrganization?.role || '')

  return {
    organization: currentOrganization,
    setCurrentOrganization,
    updateOrganization,
    hasActiveSubscription,
    isTrialing,
    subscriptionEnded,
    canAccess,
    isOwnerOrAdmin,
  }
}

// Hook for notifications with convenience methods
export function useNotifications() {
  const notifications = useAppStore((state) => state.notifications)
  const addNotification = useAppStore((state) => state.addNotification)
  const removeNotification = useAppStore((state) => state.removeNotification)
  const clearNotifications = useAppStore((state) => state.clearNotifications)

  const showSuccess = (title: string, message?: string) => {
    addNotification({ type: 'success', title, message })
  }

  const showError = (title: string, message?: string) => {
    addNotification({ type: 'error', title, message })
  }

  const showWarning = (title: string, message?: string) => {
    addNotification({ type: 'warning', title, message })
  }

  const showInfo = (title: string, message?: string) => {
    addNotification({ type: 'info', title, message })
  }

  return {
    notifications,
    addNotification,
    removeNotification,
    clearNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  }
}

// Hook for API keys management
export function useApiKeys() {
  const apiKeys = useAppStore((state) => state.apiKeys)
  const setApiKeys = useAppStore((state) => state.setApiKeys)
  const addApiKey = useAppStore((state) => state.addApiKey)
  const removeApiKey = useAppStore((state) => state.removeApiKey)

  const activeKeys = apiKeys.filter(key => {
    if (!key.expiresAt) return true
    return new Date(key.expiresAt) > new Date()
  })

  const expiredKeys = apiKeys.filter(key => {
    if (!key.expiresAt) return false
    return new Date(key.expiresAt) <= new Date()
  })

  return {
    apiKeys,
    activeKeys,
    expiredKeys,
    setApiKeys,
    addApiKey,
    removeApiKey,
  }
}

// Hook for UI state management
export function useUI() {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  const theme = useAppStore((state) => state.theme)
  const isLoading = useAppStore((state) => state.isLoading)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const setTheme = useAppStore((state) => state.setTheme)
  const setLoading = useAppStore((state) => state.setLoading)

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return {
    sidebarOpen,
    theme,
    isLoading,
    toggleSidebar,
    setTheme,
    toggleTheme,
    setLoading,
  }
}

// Hook for organization management
export function useOrganizations() {
  const organizations = useAppStore((state) => state.organizations)
  const setOrganizations = useAppStore((state) => state.setOrganizations)
  const currentOrganization = useAppStore((state) => state.currentOrganization)
  const setCurrentOrganization = useAppStore((state) => state.setCurrentOrganization)

  const switchOrganization = (organizationId: string) => {
    const org = organizations.find(o => o.id === organizationId)
    if (org) {
      setCurrentOrganization(org)
    }
  }

  const ownedOrganizations = organizations.filter(org => org.role === 'OWNER')
  const memberOrganizations = organizations.filter(org => org.role !== 'OWNER')

  return {
    organizations,
    currentOrganization,
    ownedOrganizations,
    memberOrganizations,
    setOrganizations,
    setCurrentOrganization,
    switchOrganization,
  }
}