# ADR-0005: Platform admin impersonation

## Status

Accepted

## Context

Support and engineering teams often need to reproduce user-reported issues or verify the state of a specific user's workspace. Without impersonation, the options are:

1. Ask the user to share screenshots or grant temporary access — slow and disruptive
2. Run raw SQL queries against the database — no UI context, error-prone, no audit trail
3. Build a separate admin panel that mirrors the user-facing UI — expensive duplication

A first-class impersonation feature solves this by letting a trusted operator start a full authenticated session as any user, see exactly what they see, and leave a verifiable audit trail.

The primary constraint is that impersonation is inherently a high-privilege operation. It must be:

- **Strictly scoped** — only a small set of identities should be able to invoke it
- **Auditable** — every use must be logged in a way that cannot be confused with normal user activity
- **Time-limited** — a forgotten or stolen impersonation session must not last indefinitely
- **Non-escalating** — an impersonator must not be able to gain more privilege than a normal session

## Decision

### Who can impersonate

A boolean column `is_platform_admin` is added to the `users` table. Only users with this flag set can call `POST /auth/impersonate`. The flag has no API surface — it can only be set with a direct database write:

```sql
UPDATE users SET is_platform_admin = TRUE WHERE email = 'support@yourcompany.com';
```

This is intentional. Granting platform admin is a deployment-time operation, not a product feature. Keeping it out of the API surface eliminates an entire class of privilege escalation vulnerabilities.

We rejected adding a `platform_admins` table or a separate role hierarchy because the single boolean column is sufficient and adds no complexity.

We rejected an API endpoint for granting the flag (even admin-only) because the blast radius of a compromised admin account should not extend to the ability to create new platform admins.

### Session model

Impersonation creates a **new, separate session** with:

- `userId` = the target user's ID (so RLS, tenant context, and all authorization checks work exactly as they would for the real user)
- `session.data.impersonatorId` = the platform admin's user ID
- `session.data.impersonatorSessionId` = the admin's original session ID (used to restore on stop)

The admin's original session is never modified. This means:

- Stopping impersonation simply deletes the impersonation session and reissues tokens for the still-valid admin session
- If the admin's session expires during impersonation, stopping impersonation returns a 401 and requires re-login (the 2-hour impersonation TTL makes this unlikely)
- The two sessions are completely independent — a token refresh on the impersonation session does not affect the admin's session

### Session TTL

Impersonation sessions are capped at **2 hours**, regardless of the platform's normal 7-day refresh token TTL. This is enforced in two places:

1. The session row is created with `expiresAt = now() + 2h`
2. `rotateSession` checks for `session.data.impersonatorId` and caps the new session's TTL to 2 hours instead of 7 days

This means an impersonator cannot use token rotation to extend their session beyond the 2-hour limit.

### JWT `imp` claim

The access token issued for an impersonation session carries an `imp` claim containing the platform admin's user ID. This allows the frontend to detect impersonation state by decoding the JWT locally, without an extra API call, and show the impersonation banner immediately.

The `imp` claim is never used for server-side authorization. The authoritative impersonation state is always `session.data.impersonatorId` read from the database.

### Audit trail

Two complementary layers:

1. **Impersonation lifecycle events** — `auth.impersonate_start` and `auth.impersonate_stop` are written to the `audit_logs` table with `userId = impersonator` (the platform admin), `resourceType = 'User'`, and `resourceId = targetUserId`. These events are tenant-scoped so they appear in the target tenant's audit log.

2. **Action-level metadata** — every `auditLogs.create()` call in the service layer spreads `auditMeta(ctx)` into its `metadata` field. `auditMeta` returns `{ impersonatedBy: ctx.impersonatorId }` when `ctx.impersonatorId` is set, and `{}` otherwise. This means every write action taken during impersonation — creating an API key, changing a member's role, etc. — carries a `impersonatedBy` field in its audit record.

This two-layer approach means you can answer both "who impersonated whom and when?" and "which specific actions were taken during that impersonation?" from the audit log alone.

### Restrictions during impersonation

`POST /auth/workspace` is blocked while impersonating. The impersonation request always specifies a `tenantId`, and workspace switching during an active impersonation would be confusing and could produce misleading audit trails. The impersonator must stop the current impersonation and start a new one to switch workspaces.

Platform admins cannot impersonate other platform admins. This is checked at the start of the impersonation flow and returns a 403.

### Rate limiting

`POST /auth/impersonate` is rate-limited to 10 requests per minute per IP. This is a safety valve against scripted abuse of the endpoint.

## Consequences

### Positive

- **No separate admin panel needed** — support staff see exactly what the user sees, using the same codebase
- **Complete audit trail** — every impersonation event and every action during impersonation is logged
- **Time-limited exposure** — a forgotten impersonation session cannot last more than 2 hours
- **No user disruption** — the target user's session is never affected; they can continue using the app normally while being impersonated
- **Non-escalating** — a platform admin impersonating an `owner` still operates under that owner's tenant-scoped permissions and RLS policies
- **Simple mental model** — impersonation creates a real session; all existing auth machinery works without modification

### Negative

- **2-hour TTL is arbitrary** — some support workflows may take longer. The limit can be raised in configuration, but there is currently no mechanism for per-user TTL extension.
- **Audit logs are tenant-scoped** — the `auth.impersonate_start` event is written to the target tenant's audit log. If you want a global view of all impersonations across all tenants, you need a separate query (e.g., `SELECT * FROM audit_logs WHERE action = 'auth.impersonate_start'`). There is no dedicated cross-tenant impersonation log today.
- **`is_platform_admin` requires direct DB access to grant** — this is intentional for security, but means there is no self-service workflow for adding new platform admins. An engineer must be available to run the SQL.

### Neutral

- The impersonation session's `userId` is the target user, so all RLS policies, plan limits, and permission checks apply to the target user — not the platform admin. This is correct behavior but means the impersonator cannot do anything the target user could not do.
- Token refresh during impersonation is transparent — `rotateSession` preserves `impersonatorId` and `impersonatorSessionId` in the new session, so the banner stays visible and the 2-hour cap is maintained.

## Alternatives Considered

**Read-only impersonation**
— Rejected. Read-only enforcement would require intercepting every write path, which is fragile and easy to miss. The audit trail provides accountability without needing technical enforcement. If read-only is required for a specific compliance reason it can be added later as a separate flag on the impersonation session.

**Short-lived one-time tokens instead of a full session**
— Considered. The platform admin could receive a signed URL that auto-logs them into the target account in a new browser tab. Rejected because it produces a worse operator UX (separate browser context, no easy "stop impersonation" button) and makes the audit trail harder to correlate.

**Admin panel with mirrored UI**
— Rejected. Doubles the surface area of the UI and diverges over time. The impersonation approach guarantees the admin sees exactly what the user sees.

**Storing `is_platform_admin` outside the users table (e.g. separate `platform_admins` table)**
— Rejected. Adds a join with no benefit. The column fits naturally on the `users` table and the partial index (`WHERE is_platform_admin = TRUE`) keeps lookups fast.

## References

- `packages/db/migrations/20260101000028_add_platform_admin_and_impersonation.sql` — adds `is_platform_admin`
- `apps/api/src/hooks/require-platform-admin.ts` — platform admin preHandler
- `apps/api/src/routes/auth/index.ts` — `POST /auth/impersonate`, `POST /auth/stop-impersonation`
- `apps/api/src/lib/audit-helpers.ts` — `auditMeta(ctx)` utility
- `apps/web/src/components/layout/ImpersonationBanner.tsx` — frontend indicator
- ADR-0003 — hybrid JWT + session model that impersonation builds on
