import type { Container } from 'inversify'
import Stripe              from 'stripe'
import { BillingService }  from '../services/billing.service.js'
import { TOKENS }          from '../container/tokens.js'
import { config }          from '../config.js'

export function registerBilling(container: Container): void {
  container.bind(TOKENS.StripeClient).toConstantValue(
    new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' as Stripe.LatestApiVersion, typescript: true }),
  )
  container.bind<BillingService>(TOKENS.BillingService).to(BillingService).inSingletonScope()
}
