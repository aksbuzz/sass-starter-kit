// reflect-metadata MUST be the very first import in the application.
import 'reflect-metadata'

import { Container }        from 'inversify'
import pino                 from 'pino'
import Stripe               from 'stripe'
import { config }           from '../config.js'
import { AuthService }      from '../services/auth.service.js'
import { TenantService }   from '../services/tenant.service.js'
import { BillingService }  from '../services/billing.service.js'
import { ApiKeyService }      from '../services/api-key.service.js'
import { WebhookService }     from '../services/webhook.service.js'
import { FeatureFlagService } from '../services/feature-flag.service.js'
import { AuditLogService }    from '../services/audit-log.service.js'
import {
  sql, adminSql,
  TenantsRepository,
  UsersRepository,
  OAuthAccountsRepository,
  MembershipsRepository,
  PlansRepository,
  SubscriptionsRepository,
  FeatureFlagsRepository,
  SessionsRepository,
  CacheRepository,
  JobsRepository,
  AuditLogsRepository,
  InvitationsRepository,
  ApiKeysRepository,
  WebhooksRepository,
} from '@saas/db'
import { TOKENS } from './tokens.js'

// Root container — one instance per process, not per-request
export function buildContainer(): Container {
  const container = new Container({ defaultScope: 'Singleton' })

  const logger = pino({
    level: config.LOG_LEVEL,
    ...(config.NODE_ENV !== 'production'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  })
  container.bind(TOKENS.Logger).toConstantValue(logger)

  container.bind(TOKENS.Sql).toConstantValue(sql)
  container.bind(TOKENS.AdminSql).toConstantValue(adminSql)


  container.bind(TOKENS.TenantsRepository)
    .toDynamicValue(() => new TenantsRepository(adminSql))

  container.bind(TOKENS.UsersRepository)
    .toDynamicValue(() => new UsersRepository(adminSql))

  container.bind(TOKENS.OAuthAccountsRepository)
    .toDynamicValue(() => new OAuthAccountsRepository(adminSql))

  container.bind(TOKENS.MembershipsRepository)
    .toDynamicValue(() => new MembershipsRepository(adminSql))

  container.bind(TOKENS.PlansRepository)
    .toDynamicValue(() => new PlansRepository(adminSql))

  container.bind(TOKENS.SubscriptionsRepository)
    .toDynamicValue(() => new SubscriptionsRepository(adminSql))

  container.bind(TOKENS.FeatureFlagsRepository)
    .toDynamicValue(() => new FeatureFlagsRepository(adminSql))

  container.bind(TOKENS.SessionsRepository)
    .toDynamicValue(() => new SessionsRepository(adminSql))

  container.bind(TOKENS.CacheRepository)
    .toDynamicValue(() => new CacheRepository(sql))  // app_user ok for cache

  container.bind(TOKENS.JobsRepository)
    .toDynamicValue(() => new JobsRepository(adminSql))

  container.bind(TOKENS.AuditLogsRepository)
    .toDynamicValue(() => new AuditLogsRepository(adminSql))

  container.bind(TOKENS.InvitationsRepository)
    .toDynamicValue(() => new InvitationsRepository(adminSql))

  container.bind(TOKENS.ApiKeysRepository)
    .toDynamicValue(() => new ApiKeysRepository(adminSql))

  container.bind(TOKENS.WebhooksRepository)
    .toDynamicValue(() => new WebhooksRepository(adminSql))


  const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
    typescript: true,
  })
  container.bind(TOKENS.StripeClient).toConstantValue(stripe)


  container.bind<AuthService>(TOKENS.AuthService).to(AuthService).inSingletonScope()
  container.bind<TenantService>(TOKENS.TenantService).to(TenantService).inSingletonScope()
  container.bind<BillingService>(TOKENS.BillingService).to(BillingService).inSingletonScope()
  container.bind<ApiKeyService>(TOKENS.ApiKeyService).to(ApiKeyService).inSingletonScope()
  container.bind<WebhookService>(TOKENS.WebhookService).to(WebhookService).inSingletonScope()
  container.bind<FeatureFlagService>(TOKENS.FeatureFlagService).to(FeatureFlagService).inSingletonScope()
  container.bind<AuditLogService>(TOKENS.AuditLogService).to(AuditLogService).inSingletonScope()

  return container
}

export const container = buildContainer()
