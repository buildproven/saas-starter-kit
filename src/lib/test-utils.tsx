import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// Mock the Zustand store for testing
export const mockStore = {
  user: null,
  isAuthenticated: false,
  sidebarOpen: false,
  theme: 'light' as 'light' | 'dark',
  setUser: vi.fn(),
  toggleSidebar: vi.fn(),
  setTheme: vi.fn(),
  reset: vi.fn(),
}

// Mock session data for testing
export const mockSession = {
  user: {
    id: '1',
    name: 'Test User',
    email: 'test@example.com',
    image: 'https://example.com/avatar.jpg',
    role: 'USER' as const,
  },
  expires: '2025-01-01',
}

// Mock the store module
vi.mock('@/lib/store', () => ({
  useAppStore: () => mockStore,
}))

// Mock NextAuth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: mockSession,
    status: 'authenticated',
    update: vi.fn(),
  })),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Create a custom render function that includes providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>
}

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) => {
  return render(ui, { wrapper: AllTheProviders, ...options })
}

// Re-export everything
export * from '@testing-library/react'
export { customRender as render }

// Create user event with setup
export const user = userEvent.setup()

// Test helpers
export const mockFetch = (response: unknown, status = 200) => {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValueOnce(response),
  })
}

export const mockFetchError = (error = 'Network error') => {
  global.fetch = vi.fn().mockRejectedValueOnce(new Error(error))
}

// Reset mocks helper
export const resetMocks = () => {
  mockStore.setUser.mockClear()
  mockStore.toggleSidebar.mockClear()
  mockStore.setTheme.mockClear()
  mockStore.reset.mockClear()
  vi.clearAllMocks()
}

// Helper to mock different session states
export const mockUseSession = async (
  sessionData: typeof mockSession | null = mockSession,
  status: 'authenticated' | 'loading' | 'unauthenticated' = 'authenticated'
) => {
  const nextAuthReact = vi.mocked(await import('next-auth/react'))
  nextAuthReact.useSession.mockReturnValue({
    data: sessionData,
    status,
    update: vi.fn(),
  } as ReturnType<typeof nextAuthReact.useSession>)
}
