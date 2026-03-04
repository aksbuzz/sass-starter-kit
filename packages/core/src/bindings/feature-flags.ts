import type { Container }       from 'inversify'
import { FeatureFlagService }   from '../services/feature-flag.service.js'
import { TOKENS }               from '../container/tokens.js'

export function registerFeatureFlags(container: Container): void {
  container.bind<FeatureFlagService>(TOKENS.FeatureFlagService).to(FeatureFlagService).inSingletonScope()
}
