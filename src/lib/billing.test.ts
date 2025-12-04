import { BillingService } from './billing'

// Mock Stripe client
const mockStripe = {
  customers: {
    list: vi.fn(),
    create: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
  subscriptions: {
    update: vi.fn(),
    retrieve: vi.fn(),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
  invoices: {
    retrieveUpcoming: vi.fn(),
  },
  subscriptionItems: {
    createUsageRecord: vi.fn(),
  },
  paymentMethods: {
    list: vi.fn(),
  },
  setupIntents: {
    create: vi.fn(),
  },
}

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => mockStripe,
}))

vi.mock('@/lib/billing/plan-definitions', () => ({
  getPlanNameByPriceId: vi.fn((priceId: string) => {
    const plans: Record<string, string> = {
      'price_starter': 'Starter',
      'price_pro': 'Pro',
      'price_enterprise': 'Enterprise',
    }
    return plans[priceId] ?? null
  }),
}))

describe('BillingService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createCustomer', () => {
    it('returns existing customer if found with matching organizationId', async () => {
      mockStripe.customers.list.mockResolvedValueOnce({
        data: [
          {
            id: 'cus_existing',
            email: 'test@example.com',
            name: 'Test User',
            metadata: { organizationId: 'org_123' },
          },
        ],
      })

      const result = await BillingService.createCustomer({
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'org_123',
      })

      expect(result.id).toBe('cus_existing')
      expect(result.organizationId).toBe('org_123')
      expect(mockStripe.customers.create).not.toHaveBeenCalled()
    })

    it('creates new customer if none exists', async () => {
      mockStripe.customers.list.mockResolvedValueOnce({ data: [] })
      mockStripe.customers.create.mockResolvedValueOnce({
        id: 'cus_new',
        email: 'new@example.com',
        name: 'New User',
      })

      const result = await BillingService.createCustomer({
        email: 'new@example.com',
        name: 'New User',
        organizationId: 'org_456',
      })

      expect(result.id).toBe('cus_new')
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'New User',
        metadata: { organizationId: 'org_456' },
      })
    })
  })

  describe('createCheckoutSession', () => {
    it('creates checkout session with existing customer', async () => {
      mockStripe.checkout.sessions.create.mockResolvedValueOnce({
        url: 'https://checkout.stripe.com/session_123',
      })

      const result = await BillingService.createCheckoutSession({
        customerId: 'cus_123',
        priceId: 'price_pro',
        organizationId: 'org_123',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })

      expect(result.url).toBe('https://checkout.stripe.com/session_123')
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          customer: 'cus_123',
          line_items: [{ price: 'price_pro', quantity: 1 }],
        })
      )
    })

    it('creates checkout session with new customer email', async () => {
      mockStripe.checkout.sessions.create.mockResolvedValueOnce({
        url: 'https://checkout.stripe.com/session_456',
      })

      const result = await BillingService.createCheckoutSession({
        priceId: 'price_starter',
        organizationId: 'org_456',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        customerEmail: 'new@example.com',
      })

      expect(result.url).toBe('https://checkout.stripe.com/session_456')
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: 'new@example.com',
          customer_creation: 'always',
        })
      )
    })

    it('throws error when Stripe returns no URL', async () => {
      mockStripe.checkout.sessions.create.mockResolvedValueOnce({
        url: null,
      })

      await expect(
        BillingService.createCheckoutSession({
          priceId: 'price_pro',
          organizationId: 'org_123',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
      ).rejects.toThrow('Stripe did not return a checkout session URL')
    })
  })

  describe('getCheckoutSession', () => {
    it('retrieves checkout session with line item price', async () => {
      mockStripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: 'cs_123',
        status: 'complete',
        payment_status: 'paid',
        customer_details: { email: 'test@example.com' },
        subscription: 'sub_123',
        line_items: {
          data: [{ price: { id: 'price_pro' } }],
        },
      })

      const result = await BillingService.getCheckoutSession('cs_123')

      expect(result.id).toBe('cs_123')
      expect(result.status).toBe('complete')
      expect(result.priceId).toBe('price_pro')
      expect(result.subscriptionId).toBe('sub_123')
    })

    it('falls back to metadata for priceId', async () => {
      mockStripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: 'cs_456',
        status: 'complete',
        payment_status: 'paid',
        metadata: { priceId: 'price_from_metadata' },
        line_items: { data: [] },
      })

      const result = await BillingService.getCheckoutSession('cs_456')
      expect(result.priceId).toBe('price_from_metadata')
    })
  })

  describe('createPortalSession', () => {
    it('creates billing portal session', async () => {
      mockStripe.billingPortal.sessions.create.mockResolvedValueOnce({
        url: 'https://billing.stripe.com/portal_123',
      })

      const result = await BillingService.createPortalSession({
        customerId: 'cus_123',
        returnUrl: 'https://example.com/billing',
      })

      expect(result.url).toBe('https://billing.stripe.com/portal_123')
    })
  })

  describe('cancelSubscription', () => {
    it('cancels subscription at period end', async () => {
      mockStripe.subscriptions.update.mockResolvedValueOnce({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro' } }] },
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        cancel_at_period_end: true,
      })

      const result = await BillingService.cancelSubscription('sub_123')

      expect(result.cancelAtPeriodEnd).toBe(true)
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_123', {
        cancel_at_period_end: true,
      })
    })
  })

  describe('updateSubscription', () => {
    it('updates subscription price', async () => {
      mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
        items: { data: [{ id: 'si_123', price: { id: 'price_old' }, quantity: 1 }] },
      })
      mockStripe.subscriptions.update.mockResolvedValueOnce({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_new' } }] },
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        cancel_at_period_end: false,
      })

      const result = await BillingService.updateSubscription('sub_123', {
        priceId: 'price_new',
      })

      expect(result.priceId).toBe('price_new')
    })

    it('throws error when subscription has no items', async () => {
      mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
        items: { data: [] },
      })

      await expect(
        BillingService.updateSubscription('sub_empty', { priceId: 'price_new' })
      ).rejects.toThrow('does not contain any items')
    })
  })

  describe('getSubscription', () => {
    it('returns subscription details', async () => {
      mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro' } }] },
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        cancel_at_period_end: false,
      })

      const result = await BillingService.getSubscription('sub_123')

      expect(result?.id).toBe('sub_123')
      expect(result?.status).toBe('active')
    })

    it('returns null for non-existent subscription', async () => {
      mockStripe.subscriptions.retrieve.mockRejectedValueOnce({ statusCode: 404 })

      const result = await BillingService.getSubscription('sub_nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('validateWebhookSignature', () => {
    it('returns true for valid signature', () => {
      mockStripe.webhooks.constructEvent.mockReturnValueOnce({})

      const result = BillingService.validateWebhookSignature('payload', 'sig', 'secret')
      expect(result).toBe(true)
    })

    it('returns false for invalid signature', () => {
      mockStripe.webhooks.constructEvent.mockImplementationOnce(() => {
        throw new Error('Invalid signature')
      })

      const result = BillingService.validateWebhookSignature('payload', 'bad_sig', 'secret')
      expect(result).toBe(false)
    })
  })

  describe('previewInvoice', () => {
    it('returns invoice preview', async () => {
      mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
        items: { data: [{ id: 'si_123' }] },
      })
      mockStripe.invoices.retrieveUpcoming.mockResolvedValueOnce({
        amount_due: 2900,
        currency: 'usd',
        lines: {
          data: [
            { description: 'Pro Plan', amount: 2900 },
          ],
        },
      })

      const result = await BillingService.previewInvoice({
        customerId: 'cus_123',
        newPriceId: 'price_pro',
        currentSubscriptionId: 'sub_123',
      })

      expect(result.amountDue).toBe(2900)
      expect(result.lineItems).toHaveLength(1)
    })
  })

  describe('recordUsage', () => {
    it('records usage for metered billing', async () => {
      mockStripe.subscriptionItems.createUsageRecord.mockResolvedValueOnce({})

      await BillingService.recordUsage({
        subscriptionItemId: 'si_123',
        quantity: 100,
      })

      expect(mockStripe.subscriptionItems.createUsageRecord).toHaveBeenCalledWith(
        'si_123',
        expect.objectContaining({
          quantity: 100,
          action: 'increment',
        })
      )
    })
  })

  describe('getPaymentMethods', () => {
    it('returns formatted payment methods', async () => {
      mockStripe.paymentMethods.list.mockResolvedValueOnce({
        data: [
          {
            id: 'pm_123',
            type: 'card',
            card: {
              brand: 'visa',
              last4: '4242',
              exp_month: 12,
              exp_year: 2025,
            },
          },
        ],
      })

      const result = await BillingService.getPaymentMethods('cus_123')

      expect(result).toHaveLength(1)
      expect(result[0].card?.brand).toBe('visa')
      expect(result[0].card?.last4).toBe('4242')
    })
  })

  describe('createSetupIntent', () => {
    it('creates setup intent for payment method', async () => {
      mockStripe.setupIntents.create.mockResolvedValueOnce({
        client_secret: 'seti_secret_123',
      })

      const result = await BillingService.createSetupIntent('cus_123')

      expect(result.clientSecret).toBe('seti_secret_123')
    })
  })

  describe('getUpcomingInvoice', () => {
    it('returns upcoming invoice details', async () => {
      mockStripe.invoices.retrieveUpcoming.mockResolvedValueOnce({
        amount_due: 4900,
        currency: 'usd',
        period_end: 1702592000,
        next_payment_attempt: 1702592100,
      })

      const result = await BillingService.getUpcomingInvoice('cus_123')

      expect(result?.amountDue).toBe(4900)
      expect(result?.currency).toBe('usd')
    })

    it('returns null when no upcoming invoice', async () => {
      mockStripe.invoices.retrieveUpcoming.mockRejectedValueOnce({ statusCode: 404 })

      const result = await BillingService.getUpcomingInvoice('cus_no_invoice')
      expect(result).toBeNull()
    })
  })

  describe('formatAmount', () => {
    it('formats USD amount correctly', () => {
      expect(BillingService.formatAmount(2900)).toBe('$29')
      expect(BillingService.formatAmount(10000)).toBe('$100')
    })

    it('formats other currencies', () => {
      expect(BillingService.formatAmount(2900, 'eur')).toBe('€29')
    })
  })

  describe('getPlanDisplayName', () => {
    it('returns plan name for known price', () => {
      expect(BillingService.getPlanDisplayName('price_pro')).toBe('Pro')
    })

    it('returns Unknown Plan for unknown price', () => {
      expect(BillingService.getPlanDisplayName('price_unknown')).toBe('Unknown Plan')
    })
  })

  describe('hasValidPaymentMethod', () => {
    it('returns true when customer has payment methods', async () => {
      mockStripe.paymentMethods.list.mockResolvedValueOnce({
        data: [{ id: 'pm_123', type: 'card' }],
      })

      const result = await BillingService.hasValidPaymentMethod('cus_123')
      expect(result).toBe(true)
    })

    it('returns false when customer has no payment methods', async () => {
      mockStripe.paymentMethods.list.mockResolvedValueOnce({ data: [] })

      const result = await BillingService.hasValidPaymentMethod('cus_empty')
      expect(result).toBe(false)
    })

    it('returns false on error', async () => {
      mockStripe.paymentMethods.list.mockRejectedValueOnce(new Error('API Error'))

      const result = await BillingService.hasValidPaymentMethod('cus_error')
      expect(result).toBe(false)
    })
  })
})
