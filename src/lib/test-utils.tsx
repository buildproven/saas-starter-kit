import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { NextRequest } from 'next/server'

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

// Mock user, organization, and request objects for API route testing
export const createMockUser = (overrides?: Partial<(typeof mockSession)['user']>) => ({
  ...mockSession.user,
  ...overrides,
})

export const createMockOrganization = (overrides?: {
  id?: string
  name?: string
  slug?: string
  ownerId?: string
}) => ({
  id: 'org_1',
  name: 'Test Organization',
  slug: 'test-org',
  ownerId: 'user_1',
  ...overrides,
})

export const createMockNextRequest = <T = unknown,>(method: string, url: string, body?: T) => {
  const absoluteUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`
  const request = new NextRequest(absoluteUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  }) as NextRequest & { json: () => Promise<T> }

  if (body) {
    request.json = () => Promise.resolve(body)
  }

  return request
}
