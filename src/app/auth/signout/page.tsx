'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { signOut } from '@/lib/auth/actions'
import { useAuth } from '@/hooks/use-auth'

export default function SignOutPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/')
    }
  }, [authLoading, router, user])

  const handleSignOut = async () => {
    setLoading(true)
    try {
      await signOut()
    } catch (signOutError) {
      console.error('Sign out error:', signOutError)
      setLoading(false)
    }
  }

  if (authLoading) {
    return <main className="min-h-screen flex items-center justify-center">Loading…</main>
  }

  if (!user) return null

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8 rounded-lg bg-white p-8 shadow">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900">Sign out of your account</h1>
          <p className="mt-2 text-sm text-gray-600">Are you sure you want to sign out?</p>
        </div>

        <div className="bg-gray-50 p-4 text-center">
          {user.user_metadata?.avatar_url && (
            <Image
              src={user.user_metadata.avatar_url}
              alt={user.user_metadata.full_name || 'User'}
              width={64}
              height={64}
              className="mx-auto mb-2 rounded-full"
            />
          )}
          <p className="font-medium text-gray-900">{user.user_metadata?.full_name || user.email}</p>
          <p className="text-sm text-gray-600">{user.email}</p>
        </div>

        <div className="flex space-x-4">
          <Button onClick={handleSignOut} disabled={loading} className="flex-1">
            {loading ? 'Signing out…' : 'Sign Out'}
          </Button>
          <Button onClick={() => router.push('/')} className="flex-1" variant="outline">
            Cancel
          </Button>
        </div>
      </div>
    </main>
  )
}
