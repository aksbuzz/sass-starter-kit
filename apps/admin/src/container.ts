// reflect-metadata must be the first import
import 'reflect-metadata'
import { buildCoreContainer, registerControlPlane } from '@saas/core'

const container = buildCoreContainer()
registerControlPlane(container)

export { container }
