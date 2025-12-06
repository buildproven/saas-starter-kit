import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export type AuthUser = {
  id: string
  email: string
  name: string | null
  image: string | null
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
}

export async function getUser(): Promise<AuthUser | null> {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  let user = await prisma.user.findUnique({
    where: { id: authUser.id },
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        id: authUser.id,
        email: authUser.email!,
        name: authUser.user_metadata?.full_name || null,
        image: authUser.user_metadata?.avatar_url || null,
      },
    })
  }

  return {
    id: user.id,
    email: user.email!,
    name: user.name,
    image: user.image,
    role: user.role,
  }
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getUser()
  if (!user) {
    throw new Error('UNAUTHORIZED')
  }
  return user
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser()
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw new Error('FORBIDDEN')
  }
  return user
}
