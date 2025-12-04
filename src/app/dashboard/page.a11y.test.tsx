import React from 'react'
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'vitest-axe'

expect.extend(toHaveNoViolations)

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

describe('Dashboard page accessibility', () => {
  it('has no obvious accessibility violations', async () => {
    const { container } = render(<DashboardPage />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
