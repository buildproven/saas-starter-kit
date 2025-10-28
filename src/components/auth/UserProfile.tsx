'use client'

import { useSession } from 'next-auth/react'
import Image from 'next/image'

interface UserProfileProps {
  className?: string
  showEmail?: boolean
}

export function UserProfile({ className = '', showEmail = true }: UserProfileProps) {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div className={`animate-pulse flex items-center space-x-3 ${className}`}>
        <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
        <div className="space-y-1">
          <div className="w-24 h-4 bg-gray-300 rounded"></div>
          {showEmail && <div className="w-32 h-3 bg-gray-300 rounded"></div>}
        </div>
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  const { user } = session

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {user.image ? (
        <Image
          src={user.image}
          alt={user.name || 'User avatar'}
          width={32}
          height={32}
          className="rounded-full"
        />
      ) : (
        <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center text-white text-sm font-medium">
          {user.name?.charAt(0) || user.email?.charAt(0) || '?'}
        </div>
      )}
      <div className="flex flex-col">
        {user.name && (
          <span className="text-sm font-medium text-gray-900">{user.name}</span>
        )}
        {showEmail && user.email && (
          <span className="text-xs text-gray-500">{user.email}</span>
        )}
      </div>
    </div>
  )
}