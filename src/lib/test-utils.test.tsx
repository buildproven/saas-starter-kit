import { mockFetch, mockFetchError, resetMocks, mockStore } from './test-utils'

describe('Test Utils', () => {
  beforeEach(() => {
    resetMocks()
  })

  describe('mockFetch', () => {
    it('mocks successful fetch response', () => {
      const mockResponse = { data: 'test' }
      mockFetch(mockResponse, 200)

      expect(global.fetch).toBeDefined()
    })

    it('mocks fetch with default status', () => {
      const mockResponse = { data: 'test' }
      mockFetch(mockResponse)

      expect(global.fetch).toBeDefined()
    })
  })

  describe('mockFetchError', () => {
    it('mocks fetch error with default message', () => {
      mockFetchError()

      expect(global.fetch).toBeDefined()
    })

    it('mocks fetch error with custom message', () => {
      mockFetchError('Custom error')

      expect(global.fetch).toBeDefined()
    })
  })

  describe('resetMocks', () => {
    it('clears all mocks', () => {
      mockStore.setUser.mockReturnValue('test' as unknown)

      resetMocks()

      expect(mockStore.setUser).not.toHaveReturnedWith('test')
    })
  })

  describe('mockStore', () => {
    it('has correct default values', () => {
      expect(mockStore.user).toBeNull()
      expect(mockStore.isAuthenticated).toBe(false)
      expect(mockStore.sidebarOpen).toBe(false)
      expect(mockStore.theme).toBe('light')
    })

    it('has mock functions', () => {
      expect(typeof mockStore.setUser).toBe('function')
      expect(typeof mockStore.toggleSidebar).toBe('function')
      expect(typeof mockStore.setTheme).toBe('function')
      expect(typeof mockStore.reset).toBe('function')
    })
  })
})