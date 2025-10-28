import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Session } from 'next-auth'
import { logError, ErrorType } from './error-logging'

// Types for our store
interface User {
  id: string
  email: string
  name?: string
  image?: string
  role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
}

interface Organization {
  id: string
  name: string
  slug: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
  subscription?: {
    status: string
    plan: string
    currentPeriodEnd: string
  }
}

interface ApiKey {
  id: string
  name: string
  lastUsedAt?: string
  expiresAt?: string
}

interface AppState {
  // User state (synced with NextAuth session)
  user: User | null
  isAuthenticated: boolean

  // Organization state
  organizations: Organization[]
  currentOrganization: Organization | null
  isLoading: boolean

  // API Keys
  apiKeys: ApiKey[]

  // UI state
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  notifications: Notification[]

  // User actions
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void

  // Organization actions
  setOrganizations: (organizations: Organization[]) => void
  setCurrentOrganization: (organization: Organization | null) => void
  updateOrganization: (id: string, updates: Partial<Organization>) => void

  // API Key actions
  setApiKeys: (keys: ApiKey[]) => void
  addApiKey: (key: ApiKey) => void
  removeApiKey: (id: string) => void

  // UI actions
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark') => void
  setLoading: (loading: boolean) => void

  // Notification actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void

  // Utility actions
  reset: () => void
}

interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  timestamp: number
}

// Initial state
const initialState = {
  user: null,
  isAuthenticated: false,
  organizations: [],
  currentOrganization: null,
  isLoading: false,
  apiKeys: [],
  sidebarOpen: false,
  theme: 'light' as const,
  notifications: [],
}

// Create the store
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // User actions
      setUser: (user) => {
        try {
          set(() => ({
            user,
            isAuthenticated: !!user,
          }))
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },

      setSession: (session) => {
        try {
          set(() => ({
            user: session?.user ? {
              id: session.user.id || '',
              email: session.user.email || '',
              name: session.user.name || undefined,
              image: session.user.image || undefined,
            } : null,
            isAuthenticated: !!session?.user,
          }))
        } catch (error) {
          logError(error as Error, ErrorType.AUTHENTICATION)
        }
      },

      // Organization actions
      setOrganizations: (organizations) => {
        try {
          set({ organizations })
          // Set first organization as current if none selected
          if (!get().currentOrganization && organizations.length > 0) {
            set({ currentOrganization: organizations[0] })
          }
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },

      setCurrentOrganization: (organization) => {
        try {
          set({ currentOrganization: organization })
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },

      updateOrganization: (id, updates) => {
        try {
          set((state) => ({
            organizations: state.organizations.map((org) =>
              org.id === id ? { ...org, ...updates } : org
            ),
            currentOrganization:
              state.currentOrganization?.id === id
                ? { ...state.currentOrganization, ...updates }
                : state.currentOrganization,
          }))
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },

      // API Key actions
      setApiKeys: (keys) => {
        try {
          set({ apiKeys: keys })
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },

      addApiKey: (key) => {
        try {
          set((state) => ({
            apiKeys: [...state.apiKeys, key],
          }))
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },

      removeApiKey: (id) => {
        try {
          set((state) => ({
            apiKeys: state.apiKeys.filter((key) => key.id !== id),
          }))
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },

      // UI actions
      toggleSidebar: () => set((state) => ({
        sidebarOpen: !state.sidebarOpen,
      })),

      setTheme: (theme) => set({ theme }),

      setLoading: (loading) => set({ isLoading: loading }),

      // Notification actions
      addNotification: (notification) => {
        try {
          set((state) => ({
            notifications: [
              ...state.notifications,
              {
                ...notification,
                id: Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
              },
            ],
          }))

          // Auto-remove notifications after 5 seconds (except errors)
          if (notification.type !== 'error') {
            setTimeout(() => {
              const { notifications } = get()
              const notificationExists = notifications.find(n => n.timestamp === Date.now())
              if (notificationExists) {
                get().removeNotification(notificationExists.id)
              }
            }, 5000)
          }
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },

      removeNotification: (id) => {
        try {
          set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
          }))
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },

      clearNotifications: () => {
        try {
          set({ notifications: [] })
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },

      // Utility actions
      reset: () => {
        try {
          set(initialState)
        } catch (error) {
          logError(error as Error, ErrorType.SYSTEM)
        }
      },
    }),
    {
      name: 'saas-app-storage',
      // Only persist UI preferences and current organization (not sensitive data)
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        currentOrganization: state.currentOrganization,
      }),
    }
  )
)