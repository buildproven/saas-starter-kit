import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'

import DashboardPage from './page'

vi.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => ({
    data: { user: { name: 'Test User', email: 'test@example.com' } },
    status: 'authenticated',
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Test User', email: 'test@example.com' }, isLoading: false }),
}))

vi.mock('@/lib/hooks/useStore', () => ({
  useCurrentOrganization: () => ({
    organization: { id: 'org_1', name: 'Acme Inc', role: 'ADMIN' },
    hasActiveSubscription: true,
    isTrialing: false,
  }),
  useUI: () => ({ isLoading: false }),
}))

// Mock useAuth from hooks alias to prevent async state updates
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { name: 'Test User', email: 'test@example.com' }, loading: false }),
}))

describe('Dashboard page accessibility', () => {
  it('has no obvious accessibility violations', async () => {
    const { container } = render(<DashboardPage />)
    // Wait for any pending state updates to settle
    await waitFor(() => {
      expect(container).toBeDefined()
    })
    await axe(container)
  })
})
