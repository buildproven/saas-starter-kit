'use client'

import { createClient } from '@/lib/supabase/client'

const getRedirectUrl = (path: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${path}`
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data
}

export async function signUpWithEmail(
  email: string,
  password: string,
  metadata?: { name?: string }
) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo: getRedirectUrl('/api/auth/callback'),
    },
  })
  if (error) throw error
  return data
}

export async function signInWithGoogle(redirectTo = '/dashboard') {
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getRedirectUrl(`/api/auth/callback?redirect=${redirectTo}`),
    },
  })
  if (error) throw error
}

export async function signInWithGithub(redirectTo = '/dashboard') {
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: getRedirectUrl(`/api/auth/callback?redirect=${redirectTo}`),
    },
  })
  if (error) throw error
}

export async function signOut() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  window.location.href = '/login'
}

export async function resetPassword(email: string) {
  const supabase = createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getRedirectUrl('/reset-password'),
  })
  if (error) throw error
}
