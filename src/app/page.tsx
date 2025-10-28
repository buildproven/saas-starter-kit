'use client'

import { useAppStore } from '@/lib/store'
import { useSession } from 'next-auth/react'
import { LoginButton } from '@/components/auth/LoginButton'
import { UserProfile } from '@/components/auth/UserProfile'

export default function Home() {
  const { theme, setTheme } = useAppStore()
  const { data: session } = useSession()

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="w-full max-w-4xl">
        {/* Header with auth */}
        <div className="flex justify-between items-center mb-16">
          <h1 className="text-4xl font-bold">Welcome to your SaaS</h1>
          <div className="flex items-center gap-4">
            {session ? (
              <UserProfile />
            ) : (
              <div className="text-sm text-gray-600">Not signed in</div>
            )}
            <LoginButton />
          </div>
        </div>

        {/* Main content */}
        <div className="text-center space-y-8">
          {session ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-green-600">
                🎉 You&apos;re signed in!
              </h2>
              <p className="text-gray-600">
                Welcome back, {session.user?.name || session.user?.email}
              </p>
              <div className="bg-white p-6 rounded-lg shadow border">
                <h3 className="text-lg font-medium mb-2">Your Session Info</h3>
                <pre className="text-left text-sm bg-gray-100 p-4 rounded overflow-auto">
                  {JSON.stringify(session, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-700">
                Welcome to our SaaS platform
              </h2>
              <p className="text-gray-600">
                Sign in to access your dashboard and start using our services.
              </p>
              <div className="flex justify-center gap-4">
                <LoginButton provider="google" />
                <LoginButton provider="github" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Theme toggle */}
      <div className="flex items-center gap-4">
        <p>Current theme: {theme}</p>
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Toggle Theme
        </button>
      </div>
    </main>
  )
}