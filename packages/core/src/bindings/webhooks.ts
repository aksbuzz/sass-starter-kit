import type { Container }   from 'inversify'
import { WebhookService }   from '../services/webhook.service.js'
import { TOKENS }           from '../container/tokens.js'

export function registerWebhooks(container: Container): void {
  container.bind<WebhookService>(TOKENS.WebhookService).to(WebhookService).inSingletonScope()
}
