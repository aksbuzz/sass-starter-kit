/**
 * Load test — simulates realistic concurrent usage across all major API surfaces.
 * Ramps to 20 VUs, holds for 3 minutes, then ramps down.
 *
 * Usage:
 *   k6 run scripts/load-tests/load.js
 *   k6 run --env VU_COUNT=30 scripts/load-tests/load.js
 */
import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'
import { provisionUsers, currentUser, BASE_URL } from './lib/auth.js'

const VU_COUNT = parseInt(__ENV.VU_COUNT || '20')

export const options = {
  stages: [
    { duration: '1m',  target: VU_COUNT },   // ramp up
    { duration: '3m',  target: VU_COUNT },   // hold
    { duration: '30s', target: 0          }, // ramp down
  ],
  thresholds: {
    http_req_failed:                      ['rate<0.01'],   // < 1% errors
    http_req_duration:                    ['p(95)<800'],   // 95th pct < 800 ms
    'http_req_duration{group:::health}':  ['p(95)<100'],  // health must be fast
    'http_req_duration{group:::tenants}': ['p(95)<600'],
    'http_req_duration{group:::auth}':    ['p(95)<500'],  // token refresh
  },
}

// Custom metrics
const tenantDuration = new Trend('tenant_me_duration')
const apiKeyHits     = new Counter('api_key_list_total')

export function setup() {
  return provisionUsers(VU_COUNT)
}

// VU-local token state — persists across iterations within a single VU.
// rotateSession() deletes the old session and creates a new one, so after each
// POST /auth/refresh the stored access token would return 401 on subsequent
// requests. Tracking tokens per-VU keeps each VU's session alive throughout
// the test.
let vuAccessToken   = null   // updated after each successful refresh
let vuRefreshToken  = null   // updated after each successful refresh

export default function (data) {
  const user = currentUser(data)

  // Initialise VU-local token state from provisioned data on the first iteration
  if (!vuAccessToken) {
    vuAccessToken  = user.accessToken
    vuRefreshToken = user.refreshToken
  }

  const headers = { Authorization: `Bearer ${vuAccessToken}`, 'Content-Type': 'application/json' }

  group('health', () => {
    const res = http.get(`${BASE_URL}/health`)
    check(res, { 'status 200': (r) => r.status === 200 })
  })

  sleep(0.2)

  group('tenants', () => {
    const res = http.get(`${BASE_URL}/tenants/me`, { headers })
    check(res, {
      'status 200':         (r) => r.status === 200,
      'has tenant field':   (r) => r.json('tenant') !== undefined,
    })
    tenantDuration.add(res.timings.duration)
  })

  sleep(0.3)

  group('api-keys', () => {
    const res = http.get(`${BASE_URL}/api-keys`, { headers })
    check(res, { 'status 200': (r) => r.status === 200 })
    apiKeyHits.add(1)
  })

  sleep(0.2)

  group('feature-flags', () => {
    const res = http.get(`${BASE_URL}/feature-flags/resolve?keys=new_dashboard,billing_v2,beta_api`, { headers })
    check(res, {
      'status 200':      (r) => r.status === 200,
      'has flags field': (r) => r.json('flags') !== undefined,
    })
  })

  sleep(0.3)

  group('members', () => {
    const res = http.get(`${BASE_URL}/tenants/me/members`, { headers })
    check(res, {
      'status 200':          (r) => r.status === 200,
      'has members field':   (r) => Array.isArray(r.json('members')),
    })
  })

  sleep(0.3)

  // Token refresh — staggered across VUs: (__VU + __ITER) % 20 === 0.
  // With 20 VUs at ~10 iter/min each, this produces ~10 refreshes/min total,
  // staying well under the hardcoded AUTH_RATE_LIMIT of 20 req/min per IP.
  // rotateSession() deletes the old session so we capture the new access token
  // and refresh token from the response to keep the VU session alive.
  group('auth', () => {
    if ((__VU + __ITER) % 20 === 0 && vuRefreshToken) {
      const res = http.post(`${BASE_URL}/auth/refresh`, null, {
        headers: { Cookie: `refresh_token=${vuRefreshToken}` },
      })
      const ok = check(res, {
        'refresh 200':     (r) => r.status === 200,
        'new accessToken': (r) => typeof r.json('accessToken') === 'string',
      })
      if (ok) {
        vuAccessToken  = res.json('accessToken')
        vuRefreshToken = res.cookies['refresh_token']?.[0]?.value ?? vuRefreshToken
      }
    }
  })

  sleep(0.2)
}
