import type { DefaultSession, DefaultUser } from 'next-auth'

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: (DefaultSession['user'] & {
      id: string
      role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
    }) | null
  }

  interface User extends DefaultUser {
    id: string
    role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  }
}
