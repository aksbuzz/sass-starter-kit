import http from 'k6/http'
import { check } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001'

/**
 * Creates N test users, each with their own tenant, returning workspace-scoped tokens.
 * Call this from k6's setup() function.
 *
 * @param {number} count - number of virtual users to provision
 * @returns {{ users: Array<{ accessToken: string, userId: string, tenantId: string }> }}
 */
export function provisionUsers(count) {
  const users = []

  for (let i = 0; i < count; i++) {
    const email = `loadtest+${i}@example.internal`

    // 1. Get a base token (no tenant context)
    const tokenRes = http.post(
      `${BASE_URL}/auth/dev-token`,
      JSON.stringify({ email, name: `Load Test User ${i}` }),
      { headers: { 'Content-Type': 'application/json' } },
    )

    if (!check(tokenRes, { 'dev-token 200': (r) => r.status === 200 })) {
      console.error(`Failed to get dev token for user ${i}: ${tokenRes.status} ${tokenRes.body}`)
      continue
    }

    const { accessToken: baseToken, userId } = tokenRes.json()

    // 2. Create a workspace (or reuse if already exists — 409 is fine)
    const tenantRes = http.post(
      `${BASE_URL}/tenants`,
      JSON.stringify({ name: `Load Test Workspace ${i}`, slug: `lt-workspace-${i}` }),
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${baseToken}` } },
    )

    let tenantId
    if (tenantRes.status === 201) {
      tenantId = tenantRes.json().tenant.id
    } else if (tenantRes.status === 409) {
      // Tenant already exists — fetch the list and pick the first one
      const listRes = http.get(`${BASE_URL}/tenants`, {
        headers: { Authorization: `Bearer ${baseToken}` },
      })
      tenantId = listRes.json().workspaces?.[0]?.tenantId
    }

    if (!tenantId) {
      console.error(`Failed to resolve tenantId for user ${i}`)
      continue
    }

    // 3. Select workspace — get a tenant-scoped token with role claim
    const wsRes = http.post(
      `${BASE_URL}/auth/workspace`,
      JSON.stringify({ tenantId }),
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${baseToken}` } },
    )

    if (!check(wsRes, { 'workspace 200': (r) => r.status === 200 })) {
      console.error(`Failed to select workspace for user ${i}: ${wsRes.status}`)
      continue
    }

    // dev-token sets refresh_token as an httpOnly cookie — capture it for
    // token-refresh load scenarios. The raw token value is returned by k6
    // in res.cookies['name'][0].value.
    const refreshToken = tokenRes.cookies['refresh_token']?.[0]?.value ?? ''

    users.push({ accessToken: wsRes.json().accessToken, userId, tenantId, refreshToken })
  }

  console.log(`Provisioned ${users.length}/${count} test users`)
  return { users }
}

/** Returns Authorization headers for the given user from the provisioned pool. */
export function authHeaders(data) {
  const user = data.users[__VU % data.users.length]
  return { Authorization: `Bearer ${user.accessToken}`, 'Content-Type': 'application/json' }
}

/**
 * Returns the provisioned user object for the current VU.
 * Useful when you need userId / tenantId / refreshToken beyond the auth headers.
 */
export function currentUser(data) {
  return data.users[__VU % data.users.length]
}

export { BASE_URL }
