import { Container }        from 'inversify'
import pino                 from 'pino'
import {
  sql, adminSql,
  CacheRepository,
} from '@saas/db'
import { config }           from '../config.js'
import { AuthService }      from '../services/auth.service.js'
import { TenantService }    from '../services/tenant.service.js'
import { TOKENS }           from './tokens.js'

export function buildCoreContainer(): Container {
  const container = new Container({ defaultScope: 'Singleton' })

  // ── Infrastructure ──────────────────────────────────────────────────────
  const logger = pino({
    level: config.LOG_LEVEL,
    ...(config.NODE_ENV !== 'production'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  })
  container.bind(TOKENS.Logger).toConstantValue(logger)

  container.bind(TOKENS.Sql).toConstantValue(sql)
  container.bind(TOKENS.AdminSql).toConstantValue(adminSql)

  // Cache — used by AuthService for OAuth state + auth codes
  container.bind(TOKENS.CacheRepository)
    .toDynamicValue(() => new CacheRepository(sql))

  // ── Core services ───────────────────────────────────────────────────────
  container.bind<AuthService>(TOKENS.AuthService).to(AuthService).inSingletonScope()
  container.bind<TenantService>(TOKENS.TenantService).to(TenantService).inSingletonScope()

  return container
}
