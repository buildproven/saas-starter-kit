'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Download, Mail, BookOpen, MessageCircle, Copy, ExternalLink } from 'lucide-react'

interface PurchaseData {
  sale: {
    id: string
    email: string
    package: string
    amount: number
    completedAt: string
  }
  package: {
    name: string
    features: string[]
  }
  nextSteps: {
    downloadUrl: string
    documentationUrl: string
    supportEmail: string
  }
}

export default function TemplatePurchaseSuccessPage() {
  const searchParams = useSearchParams()
  const [purchaseData, setPurchaseData] = useState<PurchaseData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    if (!sessionId) {
      setError('Invalid session ID')
      setIsLoading(false)
      return
    }

    const verifyPurchase = async () => {
      try {
        const response = await fetch(`/api/template-sales/checkout?session_id=${sessionId}`)

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to verify purchase')
        }

        const data = await response.json()
        setPurchaseData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    verifyPurchase()
  }, [searchParams])

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying your purchase...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Purchase Verification Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">{error}</p>
            <div className="space-y-2">
              <Button asChild className="w-full">
                <a href="/template-purchase">Try Again</a>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <a href="mailto:support@your-domain.com">Contact Support</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!purchaseData) {
    return null
  }

  const { sale, package: pkg, nextSteps } = purchaseData

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Purchase Successful!</h1>
          <p className="text-xl text-gray-600">
            Thank you for purchasing the {pkg.name}
          </p>
          <Badge className="mt-2" variant="secondary">
            Order ID: {sale.id}
          </Badge>
        </div>

        {/* Purchase Details */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Purchase Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2">Package</h3>
                <p className="text-gray-600">{pkg.name}</p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Amount Paid</h3>
                <p className="text-gray-600">${(sale.amount / 100).toFixed(2)}</p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Email</h3>
                <p className="text-gray-600">{sale.email}</p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Purchase Date</h3>
                <p className="text-gray-600">
                  {new Date(sale.completedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Steps */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Download Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5 text-blue-600" />
                Download Your Template
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Access your complete SaaS starter template with all source code and documentation.
              </p>
              <div className="space-y-3">
                <Button asChild className="w-full">
                  <a href={nextSteps.downloadUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="w-4 h-4 mr-2" />
                    Download Template
                  </a>
                </Button>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nextSteps.downloadUrl}
                    readOnly
                    className="flex-1 text-xs p-2 bg-gray-50 border rounded"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(nextSteps.downloadUrl, 'download')}
                  >
                    {copied === 'download' ? 'Copied!' : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Documentation Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-green-600" />
                Documentation & Guides
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Comprehensive documentation to help you get started quickly.
              </p>
              <div className="space-y-2">
                <Button variant="outline" asChild className="w-full">
                  <a href={nextSteps.documentationUrl} target="_blank" rel="noopener noreferrer">
                    <BookOpen className="w-4 h-4 mr-2" />
                    View Documentation
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </a>
                </Button>
                <Button variant="outline" asChild className="w-full">
                  <a href="/quickstart" target="_blank" rel="noopener noreferrer">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Quick Start Guide
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Support Information */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-purple-600" />
              Support & Resources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email Support
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  Get help with setup, customization, and deployment.
                </p>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <a href={`mailto:${nextSteps.supportEmail}`}>
                    Contact Support
                  </a>
                </Button>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  API Reference
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  Detailed API documentation and examples.
                </p>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <a href="/api-docs" target="_blank" rel="noopener noreferrer">
                    View API Docs
                  </a>
                </Button>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Community
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  Join our Discord community for tips and discussions.
                </p>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <a href="https://discord.gg/your-invite" target="_blank" rel="noopener noreferrer">
                    Join Discord
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What's Included */}
        <Card>
          <CardHeader>
            <CardTitle>What&apos;s Included in Your Package</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {pkg.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Email Confirmation */}
        <div className="text-center mt-8 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            📧 A confirmation email with download links has been sent to <strong>{sale.email}</strong>
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Check your spam folder if you don&apos;t see it within a few minutes.
          </p>
        </div>
      </div>
    </div>
  )
}