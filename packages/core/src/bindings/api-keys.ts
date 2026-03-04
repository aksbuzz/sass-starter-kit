import type { Container }  from 'inversify'
import { ApiKeyService }   from '../services/api-key.service.js'
import { TOKENS }          from '../container/tokens.js'

export function registerApiKeys(container: Container): void {
  container.bind<ApiKeyService>(TOKENS.ApiKeyService).to(ApiKeyService).inSingletonScope()
}
