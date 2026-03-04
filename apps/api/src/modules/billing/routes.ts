import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { FastifyPluginAsync }  from 'fastify'
import type { BillingCycle }        from '@saas/db'
import { BillingService, authenticate, requireRole, TOKENS } from '@saas/core'
import { container }                from '../../container/index.js'
import {
  checkoutBody,
  checkoutResponse,
  portalResponse,
  planListResponse,
  subscriptionResponse,
} from './schemas.js'

const adminPlus = [authenticate, requireRole('owner', 'admin')]

export const billingRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const billingSvc = container.get<BillingService>(TOKENS.BillingService)

  fastify.get('/billing/plans', {
    schema: {
      tags:     ['billing'],
      summary:  'List public plans (for pricing page)',
      response: planListResponse,
    },
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const plans = await billingSvc.listPlans()
      return reply.send({ plans })
    },
  })

  fastify.get('/billing/subscription', {
    schema: {
      tags:     ['billing'],
      summary:  'Get current workspace subscription and plan',
      security: [{ bearerAuth: [] }],
      response: subscriptionResponse,
    },
    preHandler: [authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const subscription = await billingSvc.getSubscription(request.ctx!)
      return reply.send({ subscription })
    },
  })

  fastify.post('/billing/checkout', {
    schema: {
      tags:     ['billing'],
      summary:  'Create a Stripe Checkout session for a plan upgrade',
      security: [{ bearerAuth: [] }],
      body:     checkoutBody,
      response: checkoutResponse,
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{ Body: { planSlug: string; billingCycle: BillingCycle } }>,
      reply:   FastifyReply,
    ) => {
      const { url } = await billingSvc.createCheckoutSession(request.ctx!, request.body)
      return reply.send({ url })
    },
  })

  fastify.post('/billing/portal', {
    schema: {
      tags:     ['billing'],
      summary:  'Create a Stripe Billing Portal session',
      security: [{ bearerAuth: [] }],
      response: portalResponse,
    },
    preHandler: adminPlus,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { url } = await billingSvc.createPortalSession(request.ctx!)
      return reply.send({ url })
    },
  })

  await fastify.register(async (webhook: FastifyInstance) => {
    webhook.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body as Buffer),
    )

    webhook.post('/billing/webhook', {
      schema: {
        tags:    ['billing'],
        summary: 'Stripe webhook receiver (Stripe-Signature verified)',
        hide:    true,
      },
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        const sig = request.headers['stripe-signature']
        if (!sig || typeof sig !== 'string') {
          return reply.code(400).send({ error: 'Missing Stripe-Signature header' })
        }

        try {
          await billingSvc.handleWebhook(request.body as Buffer, sig)
          return reply.code(200).send({ received: true })
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode ?? 500
          const msg    = err instanceof Error ? err.message : 'Webhook processing failed'
          request.log.error({ err }, msg)
          return reply.code(status).send({ error: msg })
        }
      },
    })
  })
}
