import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signInWithGithub,
  signOut,
  resetPassword,
} from './actions'

const mockSignInWithPassword = vi.fn()
const mockSignUp = vi.fn()
const mockSignInWithOAuth = vi.fn()
const mockSignOut = vi.fn()
const mockResetPasswordForEmail = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signInWithOAuth: mockSignInWithOAuth,
      signOut: mockSignOut,
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  })),
}))

describe('Auth Actions', () => {
  let originalWindow: typeof window
  let locationHref: string

  beforeEach(() => {
    vi.clearAllMocks()
    locationHref = ''
    originalWindow = global.window
    global.window = {
      location: {
        origin: 'http://localhost:3000',
        href: '',
      },
    } as unknown as typeof window
    Object.defineProperty(global.window.location, 'href', {
      set: (value: string) => {
        locationHref = value
      },
      get: () => locationHref,
    })
  })

  afterEach(() => {
    global.window = originalWindow
  })

  describe('signInWithEmail', () => {
    it('should sign in successfully with valid credentials', async () => {
      const mockData = {
        user: { id: 'user_1', email: 'test@example.com' },
        session: { access_token: 'token_123' },
      }
      mockSignInWithPassword.mockResolvedValueOnce({ data: mockData, error: null })

      const result = await signInWithEmail('test@example.com', 'password123')

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
      expect(result).toEqual(mockData)
    })

    it('should throw error when credentials are invalid', async () => {
      const mockError = new Error('Invalid login credentials')
      mockSignInWithPassword.mockResolvedValueOnce({ data: null, error: mockError })

      await expect(signInWithEmail('test@example.com', 'wrongpassword')).rejects.toThrow(
        'Invalid login credentials'
      )
    })

    it('should handle network errors', async () => {
      const mockError = new Error('Network error')
      mockSignInWithPassword.mockResolvedValueOnce({ data: null, error: mockError })

      await expect(signInWithEmail('test@example.com', 'password123')).rejects.toThrow(
        'Network error'
      )
    })

    it('should handle empty email', async () => {
      const mockError = new Error('Email is required')
      mockSignInWithPassword.mockResolvedValueOnce({ data: null, error: mockError })

      await expect(signInWithEmail('', 'password123')).rejects.toThrow('Email is required')
    })

    it('should handle empty password', async () => {
      const mockError = new Error('Password is required')
      mockSignInWithPassword.mockResolvedValueOnce({ data: null, error: mockError })

      await expect(signInWithEmail('test@example.com', '')).rejects.toThrow('Password is required')
    })
  })

  describe('signUpWithEmail', () => {
    it('should sign up successfully with email and password', async () => {
      const mockData = {
        user: { id: 'user_1', email: 'newuser@example.com' },
        session: null,
      }
      mockSignUp.mockResolvedValueOnce({ data: mockData, error: null })

      const result = await signUpWithEmail('newuser@example.com', 'password123')

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'password123',
        options: {
          data: undefined,
          emailRedirectTo: 'http://localhost:3000/api/auth/callback',
        },
      })
      expect(result).toEqual(mockData)
    })

    it('should sign up with metadata', async () => {
      const mockData = {
        user: { id: 'user_1', email: 'newuser@example.com' },
        session: null,
      }
      mockSignUp.mockResolvedValueOnce({ data: mockData, error: null })

      const metadata = { name: 'John Doe' }
      await signUpWithEmail('newuser@example.com', 'password123', metadata)

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'password123',
        options: {
          data: metadata,
          emailRedirectTo: 'http://localhost:3000/api/auth/callback',
        },
      })
    })

    it('should throw error when email already exists', async () => {
      const mockError = new Error('User already registered')
      mockSignUp.mockResolvedValueOnce({ data: null, error: mockError })

      await expect(signUpWithEmail('existing@example.com', 'password123')).rejects.toThrow(
        'User already registered'
      )
    })

    it('should throw error when password is too weak', async () => {
      const mockError = new Error('Password should be at least 6 characters')
      mockSignUp.mockResolvedValueOnce({ data: null, error: mockError })

      await expect(signUpWithEmail('test@example.com', '123')).rejects.toThrow(
        'Password should be at least 6 characters'
      )
    })

    it('should throw error when email is invalid', async () => {
      const mockError = new Error('Invalid email format')
      mockSignUp.mockResolvedValueOnce({ data: null, error: mockError })

      await expect(signUpWithEmail('invalid-email', 'password123')).rejects.toThrow(
        'Invalid email format'
      )
    })

    it('should use correct redirect URL in browser environment', async () => {
      const mockData = {
        user: { id: 'user_1', email: 'test@example.com' },
        session: null,
      }
      mockSignUp.mockResolvedValueOnce({ data: mockData, error: null })

      await signUpWithEmail('test@example.com', 'password123')

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            emailRedirectTo: 'http://localhost:3000/api/auth/callback',
          }),
        })
      )
    })
  })

  describe('signInWithGoogle', () => {
    it('should initiate Google OAuth flow with default redirect', async () => {
      mockSignInWithOAuth.mockResolvedValueOnce({ error: null })

      await signInWithGoogle()

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'http://localhost:3000/api/auth/callback?redirect=/dashboard',
        },
      })
    })

    it('should initiate Google OAuth flow with custom redirect', async () => {
      mockSignInWithOAuth.mockResolvedValueOnce({ error: null })

      await signInWithGoogle('/settings')

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'http://localhost:3000/api/auth/callback?redirect=/settings',
        },
      })
    })

    it('should throw error when OAuth fails', async () => {
      const mockError = new Error('OAuth provider error')
      mockSignInWithOAuth.mockResolvedValueOnce({ error: mockError })

      await expect(signInWithGoogle()).rejects.toThrow('OAuth provider error')
    })

    it('should handle network errors during OAuth', async () => {
      const mockError = new Error('Network error')
      mockSignInWithOAuth.mockResolvedValueOnce({ error: mockError })

      await expect(signInWithGoogle('/dashboard')).rejects.toThrow('Network error')
    })

    it('should encode special characters in redirect URL', async () => {
      mockSignInWithOAuth.mockResolvedValueOnce({ error: null })

      await signInWithGoogle('/dashboard?tab=billing')

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'http://localhost:3000/api/auth/callback?redirect=/dashboard?tab=billing',
        },
      })
    })
  })

  describe('signInWithGithub', () => {
    it('should initiate GitHub OAuth flow with default redirect', async () => {
      mockSignInWithOAuth.mockResolvedValueOnce({ error: null })

      await signInWithGithub()

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'github',
        options: {
          redirectTo: 'http://localhost:3000/api/auth/callback?redirect=/dashboard',
        },
      })
    })

    it('should initiate GitHub OAuth flow with custom redirect', async () => {
      mockSignInWithOAuth.mockResolvedValueOnce({ error: null })

      await signInWithGithub('/projects')

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'github',
        options: {
          redirectTo: 'http://localhost:3000/api/auth/callback?redirect=/projects',
        },
      })
    })

    it('should throw error when OAuth fails', async () => {
      const mockError = new Error('GitHub OAuth error')
      mockSignInWithOAuth.mockResolvedValueOnce({ error: mockError })

      await expect(signInWithGithub()).rejects.toThrow('GitHub OAuth error')
    })

    it('should handle permission denied error', async () => {
      const mockError = new Error('User denied permissions')
      mockSignInWithOAuth.mockResolvedValueOnce({ error: mockError })

      await expect(signInWithGithub('/dashboard')).rejects.toThrow('User denied permissions')
    })
  })

  describe('signOut', () => {
    it('should sign out successfully and redirect to login', async () => {
      mockSignOut.mockResolvedValueOnce({ error: null })

      await signOut()

      expect(mockSignOut).toHaveBeenCalled()
      expect(window.location.href).toBe('/login')
    })

    it('should throw error when sign out fails', async () => {
      const mockError = new Error('Sign out failed')
      mockSignOut.mockResolvedValueOnce({ error: mockError })

      await expect(signOut()).rejects.toThrow('Sign out failed')
      expect(window.location.href).toBe('')
    })

    it('should handle network errors during sign out', async () => {
      const mockError = new Error('Network error')
      mockSignOut.mockResolvedValueOnce({ error: mockError })

      await expect(signOut()).rejects.toThrow('Network error')
    })

    it('should redirect even if signOut succeeds', async () => {
      mockSignOut.mockResolvedValueOnce({ error: null })

      await signOut()

      expect(window.location.href).toBe('/login')
    })
  })

  describe('resetPassword', () => {
    it('should send password reset email successfully', async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: null })

      await resetPassword('test@example.com')

      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
        redirectTo: 'http://localhost:3000/reset-password',
      })
    })

    it('should throw error when email is invalid', async () => {
      const mockError = new Error('Invalid email')
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: mockError })

      await expect(resetPassword('invalid-email')).rejects.toThrow('Invalid email')
    })

    it('should throw error when email does not exist', async () => {
      const mockError = new Error('User not found')
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: mockError })

      await expect(resetPassword('nonexistent@example.com')).rejects.toThrow('User not found')
    })

    it('should handle network errors', async () => {
      const mockError = new Error('Network error')
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: mockError })

      await expect(resetPassword('test@example.com')).rejects.toThrow('Network error')
    })

    it('should use correct redirect URL', async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: null })

      await resetPassword('test@example.com')

      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          redirectTo: 'http://localhost:3000/reset-password',
        })
      )
    })

    it('should handle rate limiting errors', async () => {
      const mockError = new Error('Too many requests')
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: mockError })

      await expect(resetPassword('test@example.com')).rejects.toThrow('Too many requests')
    })
  })

  describe('edge cases', () => {
    it('should handle undefined window.location.origin gracefully', async () => {
      global.window = undefined as unknown as typeof window

      mockSignUp.mockResolvedValueOnce({
        data: { user: { id: 'user_1' }, session: null },
        error: null,
      })

      await signUpWithEmail('test@example.com', 'password123')

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            emailRedirectTo: '/api/auth/callback',
          }),
        })
      )

      global.window = originalWindow
    })

    it('should handle different window origins correctly', async () => {
      Object.defineProperty(global.window.location, 'origin', {
        value: 'https://example.com',
        writable: true,
      })

      mockResetPasswordForEmail.mockResolvedValueOnce({ error: null })

      await resetPassword('test@example.com')

      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
        redirectTo: 'https://example.com/reset-password',
      })
    })

    it('should preserve query parameters in OAuth redirects', async () => {
      mockSignInWithOAuth.mockResolvedValueOnce({ error: null })

      await signInWithGoogle('/dashboard?view=projects&sort=date')

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo:
            'http://localhost:3000/api/auth/callback?redirect=/dashboard?view=projects&sort=date',
        },
      })
    })

    it('should handle malformed error objects', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: null,
        error: { message: 'Custom error', status: 400 },
      })

      await expect(signInWithEmail('test@example.com', 'password123')).rejects.toEqual({
        message: 'Custom error',
        status: 400,
      })
    })
  })
})
