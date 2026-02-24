import path from 'node:path'
import fs   from 'node:fs'

// Try to load .env from the repo root
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..')
const envFile  = path.join(repoRoot, '.env')

if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key   = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    // Only set if not already provided by the environment
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

// Test-safe defaults for external services not exercised by these e2e tests.
const DEFAULTS: Record<string, string> = {
  NODE_ENV:               'test',
  DATABASE_URL:           'postgresql://saas_admin:password@localhost:5432/saas_test',
  DATABASE_APP_URL:       'postgresql://app_user:password@localhost:5432/saas_test',
  JWT_SECRET:             'e2e-test-secret-min-32-chars-long-enough',
  GOOGLE_CLIENT_ID:       'test-google-client-id',
  GOOGLE_CLIENT_SECRET:   'test-google-client-secret',
  GITHUB_CLIENT_ID:       'test-github-client-id',
  GITHUB_CLIENT_SECRET:   'test-github-client-secret',
  STRIPE_SECRET_KEY:      'sk_test_e2e_placeholder',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_e2e_placeholder',
  STRIPE_WEBHOOK_SECRET:  'whsec_e2e_placeholder',
  ENCRYPTION_KEY:         '0'.repeat(64),
  WEB_URL:                'http://localhost:3000',
  API_URL:                'http://localhost:3001',
}

for (const [key, value] of Object.entries(DEFAULTS)) {
  if (!(key in process.env)) {
    process.env[key] = value
  }
}
