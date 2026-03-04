import { z } from 'zod'

const schema = z.object({
  NODE_ENV:   z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL:  z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  API_PORT:   z.coerce.number().int().positive().default(3001),
  ADMIN_PORT: z.coerce.number().int().positive().default(3002),
  API_URL:    z.string().url().default('http://localhost:3001'),
  WEB_URL:    z.string().url().default('http://localhost:3000'),

  // Postgres — two connection strings because the app uses two roles
  DATABASE_URL:     z.string().url(),  // saas_admin (BYPASSRLS) — migrations + admin ops
  DATABASE_APP_URL: z.string().url(),  // app_user (RLS active) — all tenant-scoped queries

  JWT_SECRET:             z.string().min(32, 'Must be ≥ 32 chars'),
  JWT_ACCESS_EXPIRES_IN:  z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  GOOGLE_CLIENT_ID:     z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID:     z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),

  STRIPE_SECRET_KEY:      z.string().startsWith('sk_'),
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  STRIPE_WEBHOOK_SECRET:  z.string().startsWith('whsec_'),

  ENCRYPTION_KEY: z.string().length(64, 'Must be 64 hex chars (32 bytes)'),

  // Rate limiting — override for load testing environments (default: 100 req/min per IP)
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // Auth endpoints have a tighter rate limit to slow brute-force attacks.
  // Raise this in load-testing environments to avoid 429s during provisioning.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  // Alerting — optional. If set, notify() POSTs a JSON payload here on every server
  // error (5xx). Compatible with Slack incoming webhooks, Discord, PagerDuty, etc.
  ALERT_WEBHOOK_URL: z.string().url().optional(),

  // Email (SMTP) — optional. If omitted, the worker logs emails instead of sending them.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().default('noreply@example.com'),
  SMTP_SECURE: z.coerce.boolean().default(false),
})

const result = schema.safeParse(process.env)
if (!result.success) {
  console.error('❌  Invalid environment configuration:\n')
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const config = result.data
export type Config = typeof config
