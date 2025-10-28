import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const startTime = Date.now()

  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`

    const endTime = Date.now()
    const duration = endTime - startTime

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: 'connected',
        responseTime: duration,
      },
      environment: process.env.NODE_ENV,
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'development',
    })
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: 'disconnected',
          responseTime: duration,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        environment: process.env.NODE_ENV,
        version: process.env.NEXT_PUBLIC_APP_VERSION || 'development',
      },
      { status: 503 }
    )
  }
}