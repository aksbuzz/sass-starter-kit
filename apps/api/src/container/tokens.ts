// Import convention in the codebase:
//   import { TOKENS } from '@/container/tokens'
//   @inject(TOKENS.TenantsRepository) private readonly tenantsRepo: TenantsRepository

export const TOKENS = {
  Sql:       Symbol.for('Sql'),
  AdminSql:  Symbol.for('AdminSql'),
  Logger:    Symbol.for('Logger'),

  TenantsRepository:       Symbol.for('TenantsRepository'),
  UsersRepository:         Symbol.for('UsersRepository'),
  OAuthAccountsRepository: Symbol.for('OAuthAccountsRepository'),
  MembershipsRepository:   Symbol.for('MembershipsRepository'),
  PlansRepository:         Symbol.for('PlansRepository'),
  SubscriptionsRepository: Symbol.for('SubscriptionsRepository'),
  FeatureFlagsRepository:  Symbol.for('FeatureFlagsRepository'),
  SessionsRepository:      Symbol.for('SessionsRepository'),
  CacheRepository:         Symbol.for('CacheRepository'),
  JobsRepository:          Symbol.for('JobsRepository'),
  AuditLogsRepository:     Symbol.for('AuditLogsRepository'),
  InvitationsRepository:   Symbol.for('InvitationsRepository'),
  ApiKeysRepository:       Symbol.for('ApiKeysRepository'),
  WebhooksRepository:      Symbol.for('WebhooksRepository'),

  AuthService:        Symbol.for('AuthService'),
  TenantService:      Symbol.for('TenantService'),
  BillingService:     Symbol.for('BillingService'),
  ApiKeyService:      Symbol.for('ApiKeyService'),
  WebhookService:     Symbol.for('WebhookService'),
  FeatureFlagService: Symbol.for('FeatureFlagService'),
  AuditLogService:    Symbol.for('AuditLogService'),

  StripeClient:        Symbol.for('StripeClient'),
} as const
