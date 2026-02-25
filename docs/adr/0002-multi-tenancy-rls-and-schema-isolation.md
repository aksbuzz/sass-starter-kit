# ADR-0002: Multi-tenancy via RLS and optional schema isolation

## Status

Accepted

## Context

The platform is a multi-tenant SaaS application. Every user belongs to one or more tenants (workspaces). Tenant data must be isolated: a member of tenant A must never read or write data belonging to tenant B, even if they share the same database and application process.

Three classical approaches exist:

| Approach | Isolation | Cost | Complexity |
|----------|-----------|------|------------|
| **Separate database per tenant** | Strongest | High (N DB instances) | High (provisioning, migrations) |
| **Separate schema per tenant** | Strong | Medium (schema per tenant) | Medium (search_path, migrations) |
| **Shared schema + application filter** | Weakest | Low | Low (just add WHERE clause) |

A fourth option — **shared schema + database-enforced RLS** — sits between "separate schema" and "application filter": isolation is enforced at the database engine level (not by application code), but all tenants share the same schema.

The platform also serves enterprise customers who may require stronger data isolation guarantees. Forcing all tenants into one schema locks out that market.

## Decision

Implement a **two-tier isolation model**:

### Tier 1 — Default: Shared schema with PostgreSQL RLS

All tenant data lives in the public schema. Every table that contains tenant-scoped rows has an RLS policy:

```sql
CREATE POLICY tenant_isolation ON memberships
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Before any query, `withTenant()` sets two transaction-local GUCs:

```sql
SELECT set_config('app.current_tenant_id', $tenantId, true);
SELECT set_config('app.current_user_id',   $userId,   true);
```

The `true` parameter makes settings transaction-local — they reset automatically when the transaction commits or rolls back. There is no risk of GUC leakage across requests sharing the same connection pool connection.

The `app_user` role has `FORCE ROW LEVEL SECURITY`. The `saas_admin` role has `BYPASSRLS` and is used only for migrations, background jobs, and the `withAdmin()` context.

### Tier 2 — Opt-in: Dedicated schema per tenant

Enterprise tenants can be migrated to a dedicated schema (`tenant_<slug>`). When a tenant's `isolation_mode` is `schema`, `withTenant()` additionally runs:

```sql
SET LOCAL search_path = "tenant_<slug>", public;
```

The following tables are **copied** into the tenant schema at provision time:

| Table in tenant schema |
|------------------------|
| `memberships` |
| `invitations` |
| `api_keys` |
| `webhook_endpoints` |
| `webhook_deliveries` |

The following tables **remain in public** regardless of isolation mode:

| Table staying in public | Reason |
|------------------------|--------|
| `tenants`, `users`, `plans`, `subscriptions` | Cross-tenant identity and billing |
| `sessions`, `jobs` | Shared infrastructure |
| `feature_flags`, `cache` | Global + tenant overrides share one table |
| `audit_logs` | Append-only, partitioned by month — one partition set is far cheaper than N |

Schema provisioning runs as a background job (`tenant.provision-schema`) in an atomic transaction:
1. Create schema `tenant_<slug>`
2. Create copies of the 5 tables with all indexes and policies
3. Migrate existing rows from public to the new schema
4. Set `tenants.isolation_mode = 'schema'`
5. Clean up public rows for this tenant

### `withTenant()` implementation

```
withTenant({ tenantId, userId }, fn):
  1. adminSql lookup: SELECT isolation_mode, schema_name FROM tenants WHERE id = $tenantId
  2. BEGIN on sql pool (app_user)
  3. SET LOCAL app.current_tenant_id = $tenantId
  4. SET LOCAL app.current_user_id   = $userId
  5. If isolation_mode = 'schema': SET LOCAL search_path = "tenant_<slug>", public
  6. Build repository instances (bound to this transaction)
  7. Call fn({ repos, sql })
  8. COMMIT (or ROLLBACK on error)
```

## Consequences

### Positive

- **Database-enforced isolation** — application bugs that forget to filter by tenant ID do not leak data; RLS blocks them at the query level.
- **Migration path to stronger isolation** — tenants can be upgraded to schema isolation without a rewrite; only the provisioning job and `withTenant()` needed to change.
- **No N×schema migration cost for most tenants** — schema changes run once on the public schema. Only tenants in schema mode need separate migrations.
- **Zero application code change for callers** — routes and services call `withTenant()` identically regardless of the tenant's isolation mode. The context helper absorbs the difference.
- **Enterprise positioning** — offering dedicated schema isolation as a paid tier is a concrete, credible differentiator.

### Negative

- **One `adminSql` lookup per request** — `withTenant()` must query the tenants table on every call to learn the isolation mode. This adds ~1 ms latency per request (mitigated with a short in-process cache if needed).
- **Schema migrations become complex at scale** — if 500 tenants are in schema mode, a DDL change must run on 500 schemas. Requires tooling to iterate over all tenant schemas.
- **Search path can mask errors** — `SET LOCAL search_path` means a table missing from the tenant schema silently falls through to the public schema. Incorrect provisioning could yield unexpected results rather than an error.
- **Two sets of rows during provisioning** — the atomic migration copies rows to the new schema and deletes them from public within one transaction. A large tenant could cause a long-running transaction and lock contention.

### Neutral

- Schema isolation is currently provision-only (no deprovision/merge-back path).
- The `tenant_<slug>` naming convention relies on tenant slugs being unique and stable; slug changes would require schema renames.

## Alternatives Considered

**Separate database per tenant**
- Rejected: provisioning a new PostgreSQL database per tenant requires significant infrastructure automation, multiplies connection overhead, and makes cross-tenant operations (e.g., billing, analytics) very expensive. Appropriate only for customers with contractual data residency requirements, which can be handled at the infrastructure level rather than in application code.

**Application-level WHERE filtering only**
- Rejected: relies entirely on every developer remembering to add `WHERE tenant_id = $tenantId` to every query. A single missed filter is a data breach. RLS provides defence-in-depth; it catches bugs that code review misses.

**Separate schema for all tenants from day one**
- Rejected: most tenants will never require or pay for schema isolation. Running schema migrations across hundreds of tenant schemas from the start adds operational complexity with no benefit for those tenants.

**Citus (distributed PostgreSQL)**
- Rejected: Citus distributes by a shard key (tenant_id) across nodes, which is operationally far heavier than a single PostgreSQL instance. Relevant at millions of tenants; premature here.

## References

- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [PostgreSQL search_path](https://www.postgresql.org/docs/current/ddl-schemas.html#DDL-SCHEMAS-PATH)
- `packages/db/src/context.ts` — `withTenant` implementation
- `packages/db/migrations/20260101000018_create_rls_policies.sql` — RLS policy definitions
- `apps/api/src/worker/handlers/provision-schema.ts` — schema provisioning job handler
