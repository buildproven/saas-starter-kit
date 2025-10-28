// NextAuth types are included from the providers
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import { prisma } from './prisma'

export const authOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],

  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },

  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, user }: any) {
      if (session.user && user) {
        session.user.id = user.id
      }
      return session
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id
      }
      return token
    },
  },

  session: {
    strategy: 'database' as const,
  },

  events: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async createUser({ user }: any) {
      console.log(`New user created: ${user.email}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signIn({ user, account }: any) {
      console.log(`User signed in: ${user.email} via ${account?.provider}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signOut({ session }: any) {
      console.log(`User signed out: ${session?.user?.email}`)
    },
  },

  debug: process.env.NODE_ENV === 'development',
}