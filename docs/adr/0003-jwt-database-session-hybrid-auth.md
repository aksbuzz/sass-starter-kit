# ADR-0003: JWT + database session hybrid authentication

## Status

Accepted

## Context

The platform uses OAuth (Google, GitHub, etc.) for user authentication. After a user completes OAuth, the API must issue credentials the frontend can use for subsequent API calls.

Two classical approaches exist:

**Stateless JWT only** — the server issues a signed JWT containing all claims (userId, tenantId, role). No server-side state is needed. Token validity is checked by signature verification alone.

**Stateful sessions only** — the server stores a session record in a database or Redis. The client holds only a session ID (usually in a cookie). Every request validates the session ID against the store.

Each approach has well-known trade-offs that make neither ideal on its own:

| Concern | Stateless JWT | Stateful session |
|---------|--------------|-----------------|
| Revocation | Impossible before expiry | Immediate (delete row) |
| Scalability | No DB lookup per request | DB lookup per request |
| Role changes | Lag until token expires | Immediate on next request |
| CSRF | No (Bearer token) | Yes (cookie) |
| XSS | Risk if stored in localStorage | Low (httpOnly cookie) |

The platform also has a workspace-selection step: after login a user must choose a tenant before making tenant-scoped API calls. This means tenant identity and role are not known at login time and cannot be embedded in the initial token.

## Decision

Use a **hybrid model**: short-lived JWTs for API authentication combined with a server-side `sessions` table as the source of truth for session validity, tenant context, and role.

### Token lifecycle

```
POST /auth/callback (OAuth code exchange)
  ├── Upsert user in DB
  ├── INSERT INTO sessions (userId, data={})
  └── Issue:
        access token  — JWT, 15m, claims: { userId, sessionId }
        refresh token — JWT, 7d, stored as httpOnly cookie, bound to sessionId

POST /auth/workspace (tenant selection)
  ├── Validate membership
  ├── UPDATE sessions SET tenant_id = ?, data = { role, planId, ... }
  └── Issue new access token — JWT, 15m, claims: { userId, sessionId, tenantId, role }

POST /auth/refresh
  ├── Verify refresh token signature
  ├── SELECT session WHERE id = sessionId (validates session exists + not revoked)
  ├── DELETE old session row
  ├── INSERT new session row (rotation — new sessionId, new refresh token)
  └── Issue new access token with claims from new session

DELETE /auth/logout
  └── DELETE sessions WHERE id = sessionId  (immediate revocation)
```

### authenticate hook

On every protected request, the `authenticate` hook:

1. Extracts the Bearer token from `Authorization`
2. Verifies JWT signature — fast, no DB call
3. Reads `sessionId` from the JWT claims
4. Queries `SELECT * FROM sessions WHERE id = sessionId` — one DB lookup
5. Populates `request.ctx` from the session row:
   - `ctx.userId` — from JWT (trusted, signed)
   - `ctx.tenantId` — from `session.tenant_id`
   - `ctx.role` — from `session.data.role` **(not from JWT claim)**
   - `ctx.planId` — from `session.data.planId`
   - `ctx.impersonatorId` — from `session.data.impersonatorId` (present only during impersonation)

**Critical**: `ctx.role` comes from `session.data`, not from the JWT `role` claim. The JWT claim is present for informational use (e.g., frontend UI) but is not authoritative. If a user's role is changed by an admin, their very next request after token refresh will see the new role, with no need to wait for the JWT to expire.

### Why `role` in the JWT at all?

The JWT `role` claim exists so the frontend can optimistically show/hide UI elements without an extra API call. It is never used for server-side authorization decisions.

### Refresh token rotation

Each refresh produces a new session row (new `sessionId`) and invalidates the old one. This implements refresh token rotation:
- Theft detection: if the old refresh token is used after rotation, the session it references no longer exists, and the request is rejected.
- Unlimited session lifetime as long as the user is active (refreshes every 15 minutes).
- Forced logout on inactivity: if no refresh occurs within 7 days, the session row expires and the refresh token becomes invalid.

## Consequences

### Positive

- **Immediate revocation** — logout deletes the session row. A stolen access token becomes useless after at most 15 minutes; a stolen refresh token is immediately invalidated.
- **Role changes take effect instantly** — since `ctx.role` comes from the DB session, role promotions and demotions are reflected on the next request. No stale authorization window.
- **CSRF-safe access token** — the access token is sent as a `Bearer` header, not a cookie. CSRF attacks cannot inject it.
- **Refresh token protected from XSS** — the refresh token is an httpOnly cookie and is never accessible to JavaScript.
- **Workspace selection without re-login** — `POST /auth/workspace` patches the existing session row instead of creating a new one, keeping the refresh token valid while updating the tenant context.
- **One DB lookup per request** — only the session table is queried (by primary key). No joins. This is fast and cacheable if needed.

### Negative

- **One DB lookup per authenticated request** — unlike a purely stateless JWT, every request requires a session table read. At high throughput, this becomes a read hotspot on the sessions table (mitigated with indexing on `id` and a read replica if needed).
- **Session table must be available** — if the database is unreachable, all authenticated requests fail. There is no fallback to local JWT validation.
- **Access token has a 15-minute stale window** — a revoked session means the access token can still be used for up to 15 minutes if the DB is not consulted (not applicable here since we always consult it, but relevant for anyone considering removing the DB lookup).
- **Refresh token rotation requires care** — mobile clients that lose connectivity mid-rotation may end up with an invalid refresh token and require re-login. This is a known trade-off of rotation.

### Neutral

- The sessions table is in the public schema and never subject to tenant-scoped RLS, since session lookups happen before tenant context is established.
- The `data` column is JSONB, allowing new session fields to be added without schema migrations.

## Alternatives Considered

**Pure stateless JWT (no session table)**
- Rejected: role changes and logouts would not take effect until the JWT expires (up to 15 minutes). For a multi-tenant SaaS where admins can remove members or change roles, this window is unacceptable.

**Stateful session only (no JWT, cookie session ID)**
- Rejected: requires the session store to be queried on every request regardless (same DB load) but also requires CSRF protection for all state-changing endpoints, and doesn't provide a clean story for API key authentication (which is separate from user sessions).

**Redis session store**
- Rejected at this stage: Redis is not otherwise required (see ADR-0001). PostgreSQL with an indexed sessions table is fast enough for the expected load. Redis can be added later as a read cache in front of the sessions table if needed.

**Opaque refresh token (stored hash)**
- Considered: storing only the SHA-256 hash of the refresh token in the DB is more secure against DB compromise. Not implemented to keep the initial complexity low; can be added as a security hardening step.

## References

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [RFC 6749 — OAuth 2.0](https://tools.ietf.org/html/rfc6749)
- `apps/api/src/hooks/authenticate.ts` — session lookup + ctx population
- `apps/api/src/routes/auth/index.ts` — token issuance and rotation
- `packages/db/migrations/20260101000010_create_sessions.sql` — sessions table schema
- ADR-0005 — platform admin impersonation (extends the session model described here)
