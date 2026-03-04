import type { Container } from 'inversify'
import { AdminService }  from '../services/admin.service.js'
import { TOKENS }        from '../container/tokens.js'

export function registerControlPlane(container: Container): void {
  container.bind<AdminService>(TOKENS.AdminService).to(AdminService).inSingletonScope()
}
