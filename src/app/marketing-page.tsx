'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, Star, Zap, Shield, Users, Code, Database, Gauge, ArrowRight, Github, Twitter, Linkedin } from 'lucide-react'
import { LoginButton } from '@/components/auth/LoginButton'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for getting started',
    features: [
      '1 user account',
      '3 projects',
      '2 API keys',
      '10K API calls/month',
      '1GB storage',
      'Community support',
      'Basic analytics',
    ],
    notIncluded: [
      'Priority support',
      'Custom domain',
      'SSO integration',
      'Advanced analytics',
      'Webhooks',
    ],
    cta: 'Start Free',
    popular: false,
    priceId: 'free',
  },
  {
    name: 'Starter',
    price: '$19',
    period: '/month',
    description: 'For growing teams',
    features: [
      '5 user accounts',
      '10 projects',
      '10 API keys',
      '100K API calls/month',
      '10GB storage',
      'Email support',
      'Custom domain',
      'Advanced analytics',
    ],
    notIncluded: [
      'Priority support',
      'SSO integration',
      'Webhooks',
    ],
    cta: 'Start 14-day Trial',
    popular: false,
    priceId: 'price_starter_monthly',
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For professional teams',
    features: [
      '25 user accounts',
      '50 projects',
      '50 API keys',
      '1M API calls/month',
      '100GB storage',
      'Priority support',
      'Custom domain',
      'Advanced analytics',
      'SSO integration',
      'Webhooks',
    ],
    notIncluded: [],
    cta: 'Start 14-day Trial',
    popular: true,
    priceId: 'price_pro_monthly',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations',
    features: [
      'Unlimited users',
      'Unlimited projects',
      'Unlimited API keys',
      'Unlimited API calls',
      'Unlimited storage',
      '24/7 phone support',
      'Custom domain',
      'Advanced analytics',
      'SSO integration',
      'Webhooks',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
    ],
    notIncluded: [],
    cta: 'Contact Sales',
    popular: false,
    priceId: 'enterprise',
  },
]

const features = [
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Built with Next.js 14 App Router for optimal performance and developer experience.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Role-based access control, JWT sessions, and production-ready security features.',
  },
  {
    icon: Users,
    title: 'Multi-tenant Ready',
    description: 'Organizations, teams, and user management built-in with subscription enforcement.',
  },
  {
    icon: Code,
    title: 'Developer First',
    description: 'TypeScript, comprehensive testing, ESLint rules, and excellent documentation.',
  },
  {
    icon: Database,
    title: 'Production Database',
    description: 'PostgreSQL with Prisma ORM, migrations, and usage tracking out of the box.',
  },
  {
    icon: Gauge,
    title: 'Performance Optimized',
    description: 'Server components, streaming, and edge-ready architecture for scale.',
  },
]

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'CTO, TechFlow',
    content: 'This template saved us 3 months of development time. The architecture is solid and scales beautifully.',
    avatar: '/api/placeholder/40/40',
  },
  {
    name: 'Marcus Johnson',
    role: 'Founder, DataSync',
    content: 'The authentication and billing integration is exactly what we needed. Documentation is outstanding.',
    avatar: '/api/placeholder/40/40',
  },
  {
    name: 'Emily Rodriguez',
    role: 'Lead Developer, CloudCorp',
    content: 'Best SaaS starter I\'ve used. Clean code, modern stack, and enterprise-ready features.',
    avatar: '/api/placeholder/40/40',
  },
]

export default function MarketingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const { data: session } = useSession()

  const handleGetStarted = (planId: string) => {
    if (planId === 'free') {
      // Redirect to signup or dashboard
      window.location.href = session ? '/dashboard' : '/auth/signin'
    } else if (planId === 'enterprise') {
      // Redirect to contact form
      window.location.href = '/contact'
    } else {
      // Redirect to checkout or billing
      window.location.href = `/billing/checkout?plan=${planId}`
    }
  }

  const handleBuyTemplate = () => {
    window.location.href = '/template-purchase'
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Code className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl">SaaS Starter</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-gray-600 hover:text-gray-900">Features</a>
            <a href="#pricing" className="text-gray-600 hover:text-gray-900">Pricing</a>
            <a href="#testimonials" className="text-gray-600 hover:text-gray-900">Testimonials</a>
            <a href="/docs" className="text-gray-600 hover:text-gray-900">Docs</a>
          </nav>
          <div className="flex items-center gap-4">
            {session ? (
              <Button asChild>
                <a href="/dashboard">Go to Dashboard</a>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <a href="/auth/signin">Sign In</a>
                </Button>
                <LoginButton />
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <Badge className="mb-4" variant="secondary">
            <Star className="w-4 h-4 mr-1" />
            Production-Ready SaaS Template
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            Launch Your SaaS in Days, Not Months
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            A complete Next.js 14 SaaS starter with authentication, billing, multi-tenancy,
            and everything you need to build and scale your product.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button size="lg" className="text-lg px-8" onClick={() => handleGetStarted('free')}>
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button size="lg" variant="secondary" className="text-lg px-8" onClick={handleBuyTemplate}>
              Buy Template
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8" asChild>
              <a href="https://github.com/yourusername/saas-starter-template" target="_blank">
                <Github className="w-5 h-5 mr-2" />
                View on GitHub
              </a>
            </Button>
          </div>
          <div className="text-sm text-gray-500">
            No credit card required • 14-day free trial on paid plans
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-white">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need to Launch</h2>
            <p className="text-xl text-gray-600">
              Built with modern technologies and best practices for production-ready applications.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardHeader>
                  <feature.icon className="w-12 h-12 text-blue-600 mb-4" />
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-gray-600 mb-8">
              Choose the perfect plan for your business. Upgrade or downgrade at any time.
            </p>
            <div className="inline-flex items-center bg-white rounded-lg p-1 border">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingCycle === 'monthly'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingCycle === 'yearly'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Yearly
                <Badge className="ml-2" variant="secondary">Save 20%</Badge>
              </button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {plans.map((plan, index) => (
              <Card key={index} className={`relative ${
                plan.popular ? 'border-blue-500 shadow-lg scale-105' : 'border-gray-200'
              }`}>
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-600">
                    Most Popular
                  </Badge>
                )}
                <CardHeader className="text-center">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-gray-600">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-600" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                    {plan.notIncluded.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center gap-2 opacity-50">
                        <div className="w-4 h-4 border border-gray-300 rounded-full" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.popular ? 'default' : 'outline'}
                    onClick={() => handleGetStarted(plan.priceId)}
                  >
                    {plan.cta}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 px-4 bg-white">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Loved by Developers</h2>
            <p className="text-xl text-gray-600">
              See what developers are saying about our SaaS starter template.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  <p className="text-gray-600 mb-4">&ldquo;{testimonial.content}&rdquo;</p>
                  <div className="flex items-center gap-3">
                    <Image
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <div className="font-medium">{testimonial.name}</div>
                      <div className="text-sm text-gray-600">{testimonial.role}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-blue-600 text-white">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Build Your SaaS?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of developers who have launched their products with our template.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" variant="secondary" className="text-lg px-8" onClick={() => handleGetStarted('free')}>
              Start Building Today
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 border-white text-white hover:bg-white hover:text-blue-600" asChild>
              <a href="/contact">Talk to Sales</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 bg-gray-900 text-white">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Code className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-xl">SaaS Starter</span>
              </div>
              <p className="text-gray-400 mb-4">
                The fastest way to build and launch your SaaS application.
              </p>
              <div className="flex gap-4">
                <a href="#" className="text-gray-400 hover:text-white">
                  <Twitter className="w-5 h-5" />
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <Github className="w-5 h-5" />
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <Linkedin className="w-5 h-5" />
                </a>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white">Features</a></li>
                <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                <li><a href="/docs" className="hover:text-white">Documentation</a></li>
                <li><a href="/api" className="hover:text-white">API Reference</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/about" className="hover:text-white">About</a></li>
                <li><a href="/blog" className="hover:text-white">Blog</a></li>
                <li><a href="/contact" className="hover:text-white">Contact</a></li>
                <li><a href="/careers" className="hover:text-white">Careers</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/privacy" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white">Terms of Service</a></li>
                <li><a href="/security" className="hover:text-white">Security</a></li>
                <li><a href="/status" className="hover:text-white">Status</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 SaaS Starter. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}