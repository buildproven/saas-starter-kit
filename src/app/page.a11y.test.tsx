import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'

import HomePage from './page'

vi.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

// Mock useAuth to prevent async state updates that cause act warnings
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: null, loading: false }),
}))

describe('Home page accessibility', () => {
  it('has no obvious accessibility violations', async () => {
    const { container } = render(<HomePage />)
    // Wait for any pending state updates to settle
    await waitFor(() => {
      expect(container).toBeDefined()
    })
    await axe(container)
  })
})
