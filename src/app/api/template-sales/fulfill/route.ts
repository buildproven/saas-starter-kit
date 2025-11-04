import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { fulfillTemplateSale } from '@/lib/template-sales/fulfillment'
import { logError, ErrorType } from '@/lib/error-logging'

const FulfillmentRequestSchema = z.object({
  sessionId: z.string(),
  customerEmail: z.string().email(),
  package: z.enum(['basic', 'pro', 'enterprise']),
  customerName: z.string().optional(),
  companyName: z.string().optional(),
})

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.TEMPLATE_FULFILLMENT_SECRET
  if (!secret) {
    return false
  }

  const headerToken =
    request.headers.get('x-template-fulfillment-token') || request.headers.get('authorization')
  if (!headerToken) {
    return false
  }

  if (headerToken.startsWith('Bearer ')) {
    return headerToken.slice('Bearer '.length).trim() === secret
  }

  return headerToken === secret
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = FulfillmentRequestSchema.parse(body)

    const result = await fulfillTemplateSale({
      sessionId: validatedData.sessionId,
      customerEmail: validatedData.customerEmail,
      package: validatedData.package,
      customerName: validatedData.customerName,
      companyName: validatedData.companyName,
    })

    return NextResponse.json({
      success: true,
      fulfillment: result,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    logError(error as Error, ErrorType.SYSTEM)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fulfill template delivery' },
      { status: 500 }
    )
  }
}
