// reflect-metadata must be the first import
import 'reflect-metadata'
import { buildCoreContainer, registerBilling, registerWebhooks } from '@saas/core'

const container = buildCoreContainer()
registerBilling(container)
registerWebhooks(container)

export { container }
