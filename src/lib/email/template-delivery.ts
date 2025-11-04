/**
 * Template Delivery Email Service
 *
 * Handles sending tier-specific delivery emails to template customers
 * with download links, access instructions, and next steps.
 */

interface DeliveryEmailParams {
  customerEmail: string
  package: 'basic' | 'pro' | 'enterprise'
  accessCredentials: {
    licenseKey: string
    downloadToken: string
    downloadUrl: string
    expiresAt: Date | null
  }
  customerName?: string | null
  companyName?: string | null
}

interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendTemplateDeliveryEmail(params: DeliveryEmailParams): Promise<EmailResult> {
  const {
    customerEmail,
    package: packageType,
    accessCredentials,
    customerName,
    companyName,
  } = params

  try {
    // Generate tier-specific email content
    const emailContent = generateEmailContent({
      packageType,
      accessCredentials,
      customerName,
      companyName,
      customerEmail,
    })

    // Send email using your preferred service (SendGrid, Resend, etc.)
    const result = await sendEmail({
      to: customerEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    })

    return {
      success: true,
      messageId: result.messageId,
    }
  } catch (error) {
    console.error('Failed to send template delivery email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

function generateEmailContent(params: {
  packageType: string
  accessCredentials: {
    licenseKey: string
    downloadUrl: string
    expiresAt: Date | null
  }
  customerName?: string | null
  companyName?: string | null
  customerEmail: string
}) {
  const { packageType, accessCredentials, customerName, companyName } = params
  const expirationText = accessCredentials.expiresAt
    ? accessCredentials.expiresAt.toLocaleDateString()
    : 'Does not expire'

  const greeting = customerName ? `Hi ${customerName},` : companyName ? `Hi there,` : 'Hello!'

  const packageInfo = getPackageInfo(packageType)

  const subject = `🚀 Your ${packageInfo.name} is ready for download!`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: white; padding: 30px; border: 1px solid #e1e5e9; }
    .footer { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; font-size: 14px; color: #6c757d; }
    .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 10px 0; }
    .credentials { background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .feature-list { margin: 20px 0; }
    .feature-list li { margin: 8px 0; }
    .warning { background: #fff3cd; color: #856404; padding: 15px; border-radius: 6px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to SaaS Starter ${packageInfo.name}!</h1>
      <p>Your template is ready for download</p>
    </div>

    <div class="content">
      <p>${greeting}</p>

      <p>Thank you for purchasing the <strong>${packageInfo.name}</strong>! Your complete SaaS starter template is now ready for download.</p>

      <div class="credentials">
        <h3>🔑 Your Access Credentials</h3>
        <p><strong>License Key:</strong> <code>${accessCredentials.licenseKey}</code></p>
        <p><strong>Download Link:</strong> <a href="${accessCredentials.downloadUrl}" class="button">Download Template</a></p>
        <p><strong>Access Expires:</strong> ${expirationText}</p>
      </div>

      <div class="warning">
        <strong>⚠️ Important:</strong> Save your license key and download the template within 7 days. The download link will expire for security purposes.
      </div>

      <h3>📦 What's Included in Your Package</h3>
      <ul class="feature-list">
        ${packageInfo.features.map((feature) => `<li>✅ ${feature}</li>`).join('')}
      </ul>

      <h3>🚀 Next Steps</h3>
      <ol>
        <li><strong>Download the template</strong> using the link above</li>
        <li><strong>Follow the Quick Start guide</strong> in the documentation</li>
        <li><strong>Set up your development environment</strong> using the included configs</li>
        <li><strong>Deploy your first SaaS application</strong> using our deployment guides</li>
        ${getNextStepsHTML(packageType)}
      </ol>

      <h3>📚 Resources</h3>
      <p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/docs" class="button">Documentation</a>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/quickstart" class="button">Quick Start Guide</a>
        ${packageType !== 'basic' ? `<a href="${process.env.NEXT_PUBLIC_APP_URL}/premium-portal" class="button">Premium Portal</a>` : ''}
      </p>

      <h3>🆘 Need Help?</h3>
      <p>Based on your ${packageInfo.name} package, you have access to:</p>
      <ul>
        ${getSupportHTML(packageType)}
      </ul>
    </div>

    <div class="footer">
      <p>Thank you for choosing SaaS Starter Template!</p>
      <p>This email was sent to ${params.customerEmail} regarding your template purchase.</p>
      <p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}">Visit our website</a> |
        <a href="mailto:support@your-domain.com">Contact Support</a>
      </p>
    </div>
  </div>
</body>
</html>
  `

  const text = `
${greeting}

Thank you for purchasing the ${packageInfo.name}! Your complete SaaS starter template is now ready for download.

🔑 Your Access Credentials:
License Key: ${accessCredentials.licenseKey}
Download URL: ${accessCredentials.downloadUrl}
Access Expires: ${expirationText}

⚠️ Important: Save your license key and download the template within 7 days.

📦 What's Included:
${packageInfo.features.map((feature) => `• ${feature}`).join('\n')}

🚀 Next Steps:
1. Download the template using the link above
2. Follow the Quick Start guide in the documentation
3. Set up your development environment
4. Deploy your first SaaS application
${getNextStepsText(packageType)}

📚 Resources:
- Documentation: ${process.env.NEXT_PUBLIC_APP_URL}/docs
- Quick Start: ${process.env.NEXT_PUBLIC_APP_URL}/quickstart
${packageType !== 'basic' ? `- Premium Portal: ${process.env.NEXT_PUBLIC_APP_URL}/premium-portal` : ''}

🆘 Support:
${getSupportText(packageType)}
`

  return { subject, html, text }
}

function getPackageInfo(packageType: string) {
  const packages = {
    basic: {
      name: 'Basic Package',
      features: [
        'Complete Next.js 14 SaaS template',
        'Authentication & authorization',
        'Multi-tenant architecture',
        'Basic billing integration',
        'Documentation & examples',
        'Email support',
      ],
    },
    pro: {
      name: 'Pro Package',
      features: [
        'Everything in Basic',
        'Advanced billing features',
        'White-label customization',
        'Video tutorials',
        'Priority support',
        '1-hour consultation call',
        'Private GitHub repository access',
      ],
    },
    enterprise: {
      name: 'Enterprise Package',
      features: [
        'Everything in Pro',
        'Custom deployment setup',
        'Team training session',
        'Extended support (6 months)',
        'Custom integrations',
        'Source code modifications',
        'Dedicated account manager',
      ],
    },
  }

  return packages[packageType as keyof typeof packages] || packages.basic
}

function getNextStepsHTML(packageType: string): string {
  switch (packageType) {
    case 'pro':
      return `
        <li><strong>Access your private GitHub repository</strong> with premium features</li>
        <li><strong>Watch the video tutorial series</strong> in your premium portal</li>
        <li><strong>Schedule your consultation call</strong> using the calendar link</li>
      `
    case 'enterprise':
      return `
        <li><strong>Access your private GitHub repository</strong> with all enterprise features</li>
        <li><strong>Review custom deployment documentation</strong></li>
        <li><strong>Contact your account manager</strong> to schedule team training</li>
        <li><strong>Set up your dedicated support channel</strong></li>
      `
    default:
      return ''
  }
}

function getNextStepsText(packageType: string): string {
  switch (packageType) {
    case 'pro':
      return `
5. Access your private GitHub repository
6. Watch the video tutorial series
7. Schedule your consultation call`
    case 'enterprise':
      return `
5. Access your private GitHub repository
6. Review custom deployment documentation
7. Contact your account manager for team training
8. Set up your dedicated support channel`
    default:
      return ''
  }
}

function getSupportHTML(packageType: string): string {
  switch (packageType) {
    case 'basic':
      return '<li>📧 Email support (48-hour response time)</li><li>💬 Community Discord access</li>'
    case 'pro':
      return '<li>⚡ Priority email support (24-hour response time)</li><li>📞 1-hour consultation call included</li><li>🎥 Video tutorial library</li>'
    case 'enterprise':
      return '<li>🚨 24/7 phone + email support</li><li>👤 Dedicated account manager</li><li>🏢 Team training session</li><li>🔧 Custom integration consultation</li>'
    default:
      return '<li>📧 Email support</li>'
  }
}

function getSupportText(packageType: string): string {
  switch (packageType) {
    case 'basic':
      return '• Email support (48-hour response)\n• Community Discord access'
    case 'pro':
      return '• Priority email support (24-hour response)\n• 1-hour consultation call included\n• Video tutorial library'
    case 'enterprise':
      return '• 24/7 phone + email support\n• Dedicated account manager\n• Team training session\n• Custom integration consultation'
    default:
      return '• Email support'
  }
}

// Email sending function - implement with your preferred service
async function sendEmail(params: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<{ messageId: string }> {
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.FROM_EMAIL || 'SaaS Starter <noreply@example.com>'

  if (resendKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(`Resend request failed: ${message}`)
    }

    const data = (await response.json()) as { id?: string }
    return { messageId: data.id ?? `resend-${Date.now()}` }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('📧 Email would be sent:', {
      to: params.to,
      subject: params.subject,
      preview: params.text.substring(0, 200) + '...',
    })

    return { messageId: `dev-${Date.now()}` }
  }

  console.warn('Email service not configured. Skipping outbound template delivery email.')
  return { messageId: `noop-${Date.now()}` }
}
