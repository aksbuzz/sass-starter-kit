import path from 'node:path'
import fs   from 'node:fs'

// Patch tsx's fileMatcher so cross-package files (packages/core) get decorator
// support.  tsx resolves tsconfig from CWD and only applies compilerOptions to
// files matching the tsconfig "include" glob.  Files in packages/core/ fall
// outside apps/api/tsconfig.json's include, so esbuild rejects @inject decorators.
for (const [, mod] of Object.entries(require.cache)) {
  if (mod?.exports && typeof mod.exports.fileMatcher === 'function') {
    const original = mod.exports.fileMatcher
    mod.exports.fileMatcher = (filePath: string) => {
      const result = original(filePath)
      if (result) return result
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        return { experimentalDecorators: true, emitDecoratorMetadata: true }
      }
    }
    break
  }
}

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
    // Only set if not already provided by the environment (skip empty values so defaults can apply)
    if (!(key in process.env) || process.env[key] === '') {
      process.env[key] = value
    }
  }
}

// Test-safe defaults for external services not exercised by these e2e tests.
const DEFAULTS: Record<string, string> = {
  NODE_ENV:               'test',
  DATABASE_URL:           'postgresql://saas_admin:saas_password@localhost:5432/saas_dev?sslmode=disable',
  DATABASE_APP_URL:       'postgresql://app_user:app_user_password@localhost:5432/saas_dev?sslmode=disable',
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
  if (!(key in process.env) || !process.env[key]) {
    process.env[key] = value
  }
}
