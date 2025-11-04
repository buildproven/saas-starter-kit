'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Check, Star, ArrowRight, Code, Zap, Shield } from 'lucide-react'

const packages = [
  {
    id: 'basic',
    name: 'Basic Template',
    price: '$299',
    originalPrice: '$499',
    description: 'Perfect for solo developers and small projects',
    features: [
      'Complete Next.js 14 SaaS template',
      'Authentication & authorization system',
      'Multi-tenant architecture',
      'Basic Stripe billing integration',
      'Comprehensive documentation',
      'Email support for 30 days',
      'Lifetime updates',
    ],
    popular: false,
    badge: 'Best Value',
  },
  {
    id: 'pro',
    name: 'Pro Template',
    price: '$599',
    originalPrice: '$999',
    description: 'For serious developers and growing teams',
    features: [
      'Everything in Basic',
      'Advanced billing & subscription features',
      'White-label customization guide',
      'Video tutorials & walkthroughs',
      'Priority support for 90 days',
      '1-hour consultation call',
      'Custom deployment assistance',
    ],
    popular: true,
    badge: 'Most Popular',
  },
  {
    id: 'enterprise',
    name: 'Enterprise Package',
    price: '$1,499',
    originalPrice: '$2,999',
    description: 'For teams and enterprises',
    features: [
      'Everything in Pro',
      'Custom deployment & setup',
      'Team training session (2 hours)',
      'Extended support (6 months)',
      'Custom integrations assistance',
      'Source code modifications',
      'Dedicated Slack channel',
    ],
    popular: false,
    badge: 'Enterprise',
  },
]

export default function TemplatePurchasePage() {
  const [selectedPackage, setSelectedPackage] = useState<string>('pro')
  const [formData, setFormData] = useState({
    email: '',
    companyName: '',
    useCase: '',
  })
  const [isLoading, setIsLoading] = useState(false)

  const handlePurchase = async () => {
    if (!formData.email) {
      alert('Please enter your email address')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/template-sales/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          package: selectedPackage,
          email: formData.email,
          companyName: formData.companyName || undefined,
          useCase: formData.useCase || undefined,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create checkout session')
      }

      const { url } = await response.json()
      window.location.href = url

    } catch (error) {
      console.error('Purchase error:', error)
      alert(`Purchase failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const selectedPkg = packages.find(pkg => pkg.id === selectedPackage)

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Code className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl">SaaS Starter</span>
          </div>
          <Button variant="ghost" asChild>
            <a href="/">← Back to Home</a>
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <Badge className="mb-4" variant="secondary">
            <Star className="w-4 h-4 mr-1" />
            Limited Time Offer - 40% Off
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Get Your SaaS Template
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Skip months of development and launch your SaaS in days.
            Complete template with authentication, billing, and more.
          </p>
        </div>

        {/* Package Selection */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {packages.map((pkg) => (
            <Card
              key={pkg.id}
              className={`cursor-pointer transition-all ${
                selectedPackage === pkg.id
                  ? 'ring-2 ring-blue-500 shadow-lg'
                  : pkg.popular
                    ? 'border-blue-500 shadow-lg'
                    : 'hover:shadow-md'
              } ${pkg.popular ? 'scale-105' : ''}`}
              onClick={() => setSelectedPackage(pkg.id)}
            >
              {pkg.popular && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-600">
                  {pkg.badge}
                </Badge>
              )}
              <CardHeader className="text-center relative">
                <CardTitle className="text-2xl">{pkg.name}</CardTitle>
                <CardDescription>{pkg.description}</CardDescription>
                <div className="mt-4">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-3xl font-bold text-blue-600">{pkg.price}</span>
                    <span className="text-lg text-gray-400 line-through">{pkg.originalPrice}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">One-time payment</p>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {pkg.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={selectedPackage === pkg.id ? 'default' : 'outline'}
                >
                  {selectedPackage === pkg.id ? 'Selected' : 'Select Package'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Purchase Form */}
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-600" />
              Complete Your Purchase
            </CardTitle>
            <CardDescription>
              You&apos;ve selected the <strong>{selectedPkg?.name}</strong> for <strong>{selectedPkg?.price}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <p className="text-sm text-gray-500">
                We&apos;ll send download links and access instructions to this email.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company Name (Optional)</Label>
              <Input
                id="company"
                placeholder="Acme Corp"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="usecase">What will you build with this template? (Optional)</Label>
              <Textarea
                id="usecase"
                placeholder="e.g., Internal tools platform, Customer portal, SaaS marketplace..."
                value={formData.useCase}
                onChange={(e) => setFormData({ ...formData, useCase: e.target.value })}
                rows={3}
              />
              <p className="text-sm text-gray-500">
                This helps us provide better support and relevant examples.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-600" />
                What you get:
              </h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>✓ Instant access after payment</li>
                <li>✓ Complete source code & documentation</li>
                <li>✓ Setup guide & video tutorials</li>
                <li>✓ Lifetime updates & support</li>
                <li>✓ 30-day money-back guarantee</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              size="lg"
              onClick={handlePurchase}
              disabled={isLoading || !formData.email}
            >
              {isLoading ? (
                'Processing...'
              ) : (
                <>
                  Purchase {selectedPkg?.name} for {selectedPkg?.price}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* Trust Indicators */}
        <div className="text-center mt-12 text-sm text-gray-500">
          <p>Secure payment processing by Stripe • 30-day money-back guarantee</p>
          <p className="mt-2">Used by 500+ developers worldwide</p>
        </div>
      </div>
    </div>
  )
}