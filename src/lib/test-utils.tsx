import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the Zustand store for testing
export const mockStore = {
  user: null,
  isAuthenticated: false,
  sidebarOpen: false,
  theme: 'light' as 'light' | 'dark',
  setUser: jest.fn(),
  toggleSidebar: jest.fn(),
  setTheme: jest.fn(),
  reset: jest.fn(),
}

// Mock session data for testing
export const mockSession = {
  user: {
    id: '1',
    name: 'Test User',
    email: 'test@example.com',
    image: 'https://example.com/avatar.jpg',
    role: 'USER',
  },
  expires: '2025-01-01',
}

// Mock the store module
jest.mock('@/lib/store', () => ({
  useAppStore: () => mockStore,
}))

// Mock NextAuth
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: mockSession,
    status: 'authenticated',
    update: jest.fn(),
  })),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Create a custom render function that includes providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => {
  return render(ui, { wrapper: AllTheProviders, ...options })
}

// Re-export everything
export * from '@testing-library/react'
export { customRender as render }

// Create user event with setup
export const user = userEvent.setup()

// Test helpers
export const mockFetch = (response: unknown, status = 200) => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValueOnce(response),
  })
}

export const mockFetchError = (error = 'Network error') => {
  global.fetch = jest.fn().mockRejectedValueOnce(new Error(error))
}

// Reset mocks helper
export const resetMocks = () => {
  mockStore.setUser.mockClear()
  mockStore.toggleSidebar.mockClear()
  mockStore.setTheme.mockClear()
  mockStore.reset.mockClear()
  jest.clearAllMocks()
}

// Helper to mock different session states
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockUseSession = (sessionData: any = mockSession, status = 'authenticated') => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useSession } = require('next-auth/react')
  useSession.mockReturnValue({
    data: sessionData,
    status,
    update: jest.fn(),
  })
}
