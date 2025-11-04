'use client'

import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { XCircle, ArrowLeft, Mail } from 'lucide-react'

export default function TemplatePurchaseCancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex items-center justify-center">
      <div className="container mx-auto px-4 max-w-2xl">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Purchase Cancelled</CardTitle>
            <p className="text-gray-600">
              Your purchase was cancelled. No payment has been processed.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium mb-2">What happened?</h3>
              <p className="text-sm text-gray-600 mb-3">
                You cancelled the checkout process or the payment was not completed.
                This is completely normal and no charges were made to your card.
              </p>
              <p className="text-sm text-gray-600">
                If you encountered any issues during checkout, we&apos;re here to help!
              </p>
            </div>

            <div className="space-y-3">
              <Button asChild className="w-full">
                <a href="/template-purchase">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Try Again
                </a>
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" asChild>
                  <a href="/">
                    Back to Home
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="mailto:support@your-domain.com">
                    <Mail className="w-4 h-4 mr-2" />
                    Get Help
                  </a>
                </Button>
              </div>
            </div>

            <div className="text-center text-sm text-gray-500 border-t pt-4">
              <p>Need assistance with your purchase?</p>
              <p>Contact us at <a href="mailto:support@your-domain.com" className="text-blue-600 hover:underline">support@your-domain.com</a></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}