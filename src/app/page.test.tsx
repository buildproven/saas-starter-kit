import { render, screen, user, resetMocks, mockStore } from '@/lib/test-utils'
import Home from './page'

// Mock the store module
jest.mock('@/lib/store')

describe('Home Page', () => {
  beforeEach(() => {
    resetMocks()
    // Reset store to default state
    mockStore.theme = 'light'
    mockStore.user = null
    mockStore.isAuthenticated = false
  })

  it('renders the welcome message', () => {
    render(<Home />)

    expect(screen.getByRole('heading', { name: /welcome to your saas/i })).toBeInTheDocument()
  })

  it('displays the current theme', () => {
    render(<Home />)

    expect(screen.getByText('Current theme: light')).toBeInTheDocument()
  })

  it('displays dark theme when store has dark theme', () => {
    mockStore.theme = 'dark'

    render(<Home />)

    expect(screen.getByText('Current theme: dark')).toBeInTheDocument()
  })

  it('has a theme toggle button', () => {
    render(<Home />)

    const toggleButton = screen.getByRole('button', { name: /toggle theme/i })
    expect(toggleButton).toBeInTheDocument()
    expect(toggleButton).toHaveClass('px-4', 'py-2', 'bg-blue-500', 'text-white')
  })

  it('calls setTheme when toggle button is clicked (light to dark)', async () => {
    mockStore.theme = 'light'

    render(<Home />)

    const toggleButton = screen.getByRole('button', { name: /toggle theme/i })
    await user.click(toggleButton)

    expect(mockStore.setTheme).toHaveBeenCalledWith('dark')
    expect(mockStore.setTheme).toHaveBeenCalledTimes(1)
  })

  it('calls setTheme when toggle button is clicked (dark to light)', async () => {
    mockStore.theme = 'dark'

    render(<Home />)

    const toggleButton = screen.getByRole('button', { name: /toggle theme/i })
    await user.click(toggleButton)

    expect(mockStore.setTheme).toHaveBeenCalledWith('light')
    expect(mockStore.setTheme).toHaveBeenCalledTimes(1)
  })

  it('has proper layout structure', () => {
    render(<Home />)

    const main = screen.getByRole('main')
    expect(main).toHaveClass('flex', 'min-h-screen', 'flex-col', 'items-center', 'justify-between', 'p-24')

    const themeSection = screen.getByText(/current theme:/i).parentElement
    expect(themeSection).toHaveClass('flex', 'items-center', 'gap-4')
  })

  it('has accessible structure', () => {
    render(<Home />)

    // Should have a main landmark
    expect(screen.getByRole('main')).toBeInTheDocument()

    // Should have a heading
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()

    // Button should be focusable
    const button = screen.getByRole('button', { name: /toggle theme/i })
    expect(button).not.toHaveAttribute('disabled')
  })
})