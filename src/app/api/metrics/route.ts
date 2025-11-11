/**
 * Prometheus Metrics Endpoint
 *
 * Exposes metrics in Prometheus format for scraping.
 * Should be protected in production (e.g., firewall rules, internal network only).
 */

import { NextRequest, NextResponse } from 'next/server'
import { registry } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const metrics = await registry.metrics()

    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': registry.contentType,
      },
    })
  } catch (error) {
    console.error('Failed to generate metrics:', error)
    return NextResponse.json({ error: 'Failed to generate metrics' }, { status: 500 })
  }
}
