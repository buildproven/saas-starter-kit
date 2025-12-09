import { useAppStore } from '../store'
import { useAuth } from '@/hooks/use-auth'
import { useEffect } from 'react'

// Hook to sync Supabase session with Zustand store
export function useSessionSync() {
  const { user, loading } = useAuth()
  const setUser = useAppStore((state) => state.setUser)

  useEffect(() => {
    if (!loading) {
      if (user) {
        setUser({
          id: user.id,
          email: user.email || '',
          name: user.user_metadata?.full_name,
          image: user.user_metadata?.avatar_url,
          // Map role from metadata if available, or default to USER
          // Note: Real RBAC should probably come from database/claims
          role: (user.app_metadata?.role as 'USER' | 'ADMIN' | 'SUPER_ADMIN') || 'USER',
        })
      } else {
        setUser(null)
      }
    }
  }, [user, loading, setUser])

  return { user, loading }
}

// Hook for current organization with subscription info
export function useCurrentOrganization() {
  const currentOrganization = useAppStore((state) => state.currentOrganization)
  const setCurrentOrganization = useAppStore((state) => state.setCurrentOrganization)
  const updateOrganization = useAppStore((state) => state.updateOrganization)

  const hasActiveSubscription = currentOrganization?.subscription?.status === 'ACTIVE'
  const isTrialing = currentOrganization?.subscription?.status === 'TRIALING'
  const subscriptionEnded = ['CANCELED', 'PAST_DUE', 'UNPAID'].includes(
    currentOrganization?.subscription?.status || ''
  )

  const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(currentOrganization?.role || '')
  const canAccess = (_featureKey: string) => {
    // Currently gate by active/trialing subscription; _featureKey placeholder for future limits
    if (!currentOrganization?.subscription) return false
    return ['ACTIVE', 'TRIALING'].includes(currentOrganization.subscription.status || '')
  }

  return {
    organization: currentOrganization,
    setCurrentOrganization,
    updateOrganization,
    hasActiveSubscription,
    isTrialing,
    subscriptionEnded,
    isOwnerOrAdmin,
    canAccess,
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

  const activeKeys = apiKeys.filter((key) => {
    if (!key.expiresAt) return true
    return new Date(key.expiresAt) > new Date()
  })

  const expiredKeys = apiKeys.filter((key) => {
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
    const org = organizations.find((o) => o.id === organizationId)
    if (org) {
      setCurrentOrganization(org)
    }
  }

  const ownedOrganizations = organizations.filter((org) => org.role === 'OWNER')
  const memberOrganizations = organizations.filter((org) => org.role !== 'OWNER')

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
