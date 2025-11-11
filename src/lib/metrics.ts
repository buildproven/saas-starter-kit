/**
 * Prometheus Metrics
 *
 * Application metrics for monitoring and alerting.
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client'

// Create a Registry which registers the metrics
export const registry = new Registry()

// Default labels applied to all metrics
registry.setDefaultLabels({
  app: 'saas-starter-template',
  env: process.env.NODE_ENV || 'development',
})

// HTTP request duration histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
})

// HTTP request counter
export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
})

// Active requests gauge
export const httpRequestsActive = new Gauge({
  name: 'http_requests_active',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method', 'route'],
  registers: [registry],
})

// Template download metrics
export const templateDownloads = new Counter({
  name: 'template_downloads_total',
  help: 'Total template downloads',
  labelNames: ['package', 'status', 'format'],
  registers: [registry],
})

export const templateDownloadDuration = new Histogram({
  name: 'template_download_duration_seconds',
  help: 'Template download duration in seconds',
  labelNames: ['package', 'format'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
})

// Template sales metrics
export const templateSales = new Counter({
  name: 'template_sales_total',
  help: 'Total template sales',
  labelNames: ['package'],
  registers: [registry],
})

export const templateSalesRevenue = new Counter({
  name: 'template_sales_revenue_cents',
  help: 'Total template sales revenue in cents',
  labelNames: ['package'],
  registers: [registry],
})

// Authentication metrics
export const authAttempts = new Counter({
  name: 'auth_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['provider', 'result'],
  registers: [registry],
})

export const activeUsers = new Gauge({
  name: 'active_users',
  help: 'Number of currently authenticated users',
  registers: [registry],
})

// API key metrics
export const apiKeyUsage = new Counter({
  name: 'api_key_usage_total',
  help: 'Total API key usage',
  labelNames: ['organization_id', 'key_id', 'scopes'],
  registers: [registry],
})

export const apiKeyCreated = new Counter({
  name: 'api_keys_created_total',
  help: 'Total API keys created',
  labelNames: ['organization_id'],
  registers: [registry],
})

// Subscription metrics
export const subscriptions = new Gauge({
  name: 'subscriptions_active',
  help: 'Number of active subscriptions',
  labelNames: ['plan', 'interval'],
  registers: [registry],
})

export const subscriptionEvents = new Counter({
  name: 'subscription_events_total',
  help: 'Total subscription events',
  labelNames: ['event_type', 'plan'],
  registers: [registry],
})

// Webhook metrics
export const webhookEvents = new Counter({
  name: 'webhook_events_total',
  help: 'Total webhook events received',
  labelNames: ['event_type', 'result'],
  registers: [registry],
})

export const webhookProcessingDuration = new Histogram({
  name: 'webhook_processing_duration_seconds',
  help: 'Webhook processing duration in seconds',
  labelNames: ['event_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
})

// Database metrics
export const databaseQueries = new Counter({
  name: 'database_queries_total',
  help: 'Total database queries',
  labelNames: ['operation', 'model'],
  registers: [registry],
})

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
})

// External API metrics
export const externalApiCalls = new Counter({
  name: 'external_api_calls_total',
  help: 'Total external API calls',
  labelNames: ['service', 'operation', 'status'],
  registers: [registry],
})

export const externalApiDuration = new Histogram({
  name: 'external_api_duration_seconds',
  help: 'External API call duration in seconds',
  labelNames: ['service', 'operation'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
})

// Rate limiting metrics
export const rateLimitExceeded = new Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total rate limit exceeded events',
  labelNames: ['endpoint', 'ip'],
  registers: [registry],
})

// Error metrics
export const errors = new Counter({
  name: 'errors_total',
  help: 'Total errors',
  labelNames: ['type', 'severity', 'component'],
  registers: [registry],
})

// Business metrics
export const revenue = new Counter({
  name: 'revenue_cents',
  help: 'Total revenue in cents',
  labelNames: ['source', 'currency'],
  registers: [registry],
})

export const organizationsCreated = new Counter({
  name: 'organizations_created_total',
  help: 'Total organizations created',
  registers: [registry],
})

export const organizationsActive = new Gauge({
  name: 'organizations_active',
  help: 'Number of active organizations',
  registers: [registry],
})

/**
 * Helper to measure function execution time
 */
export async function measureAsync<T>(
  histogram: Histogram<string>,
  labels: Record<string, string | number>,
  fn: () => Promise<T>
): Promise<T> {
  const end = histogram.startTimer(labels)
  try {
    const result = await fn()
    end()
    return result
  } catch (error) {
    end()
    throw error
  }
}

/**
 * Helper to measure synchronous function execution time
 */
export function measure<T>(
  histogram: Histogram<string>,
  labels: Record<string, string | number>,
  fn: () => T
): T {
  const end = histogram.startTimer(labels)
  try {
    const result = fn()
    end()
    return result
  } catch (error) {
    end()
    throw error
  }
}

/**
 * Increment counter helper
 */
export function increment(
  counter: Counter<string>,
  labels?: Record<string, string | number>,
  value = 1
) {
  counter.inc(labels, value)
}

/**
 * Set gauge helper
 */
export function set(gauge: Gauge<string>, value: number, labels?: Record<string, string | number>) {
  gauge.set(labels, value)
}

/**
 * Collect default Node.js metrics (memory, CPU, etc.)
 */
import { collectDefaultMetrics } from 'prom-client'

collectDefaultMetrics({
  register: registry,
  prefix: 'nodejs_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
})

export default registry
