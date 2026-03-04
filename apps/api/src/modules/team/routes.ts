import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { FastifyPluginAsync }  from 'fastify'
import { withTenant, withAdmin }    from '@saas/db'
import type { MemberRole }          from '@saas/db'
import { TeamService, authenticate, requireRole, TOKENS } from '@saas/core'
import { container }                from '../../container/index.js'
import {
  inviteMemberBody,
  updateRoleBody,
  memberListResponse,
  invitationResponse,
  paginationQuery,
} from './schemas.js'

const adminPlus = [authenticate, requireRole('owner', 'admin')]
const ownerOnly = [authenticate, requireRole('owner')]

export const teamRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const teamSvc = container.get<TeamService>(TOKENS.TeamService)

  fastify.get('/tenants/me/members', {
    schema: {
      tags:        ['members'],
      summary:     'List workspace members with user details',
      security:    [{ bearerAuth: [] }],
      querystring: paginationQuery,
      response:    memberListResponse,
    },
    preHandler: [authenticate, requireRole('owner', 'admin', 'member')],
    handler: async (
      request: FastifyRequest<{ Querystring: { limit: number; offset: number } }>,
      reply:   FastifyReply,
    ) => {
      const { limit, offset } = request.query
      const ctx = request.ctx!

      if (!ctx.tenantId) return reply.code(400).send({ error: 'No active workspace' })

      const members = await withTenant(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        ({ repos }) => repos.memberships.findAll({ limit, offset }),
      )

      return reply.send({ members })
    },
  })

  fastify.get('/tenants/me/invitations', {
    schema: {
      tags:     ['members'],
      summary:  'List pending invitations',
      security: [{ bearerAuth: [] }],
    },
    preHandler: adminPlus,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = request.ctx!
      if (!ctx.tenantId) return reply.code(400).send({ error: 'No active workspace' })

      const invitations = await withTenant(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        ({ repos }) => repos.invitations.listPending(),
      )
      return reply.send({ invitations })
    },
  })

  fastify.post('/tenants/me/members/invite', {
    schema: {
      tags:     ['members'],
      summary:  'Invite a user to the workspace',
      security: [{ bearerAuth: [] }],
      body:     inviteMemberBody,
      response: invitationResponse,
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{ Body: { email: string; role: MemberRole } }>,
      reply:   FastifyReply,
    ) => {
      const invitation = await teamSvc.inviteMember(request.ctx!, request.body)
      return reply.code(201).send(invitation)
    },
  })

  fastify.delete('/tenants/me/invitations/:invitationId', {
    schema: {
      tags:     ['members'],
      summary:  'Cancel a pending invitation',
      security: [{ bearerAuth: [] }],
    },
    preHandler: adminPlus,
    handler: async (
      request: FastifyRequest<{ Params: { invitationId: string } }>,
      reply:   FastifyReply,
    ) => {
      const ctx = request.ctx!
      if (!ctx.tenantId) return reply.code(400).send({ error: 'No active workspace' })

      await withTenant(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        ({ repos }) => repos.invitations.delete(request.params.invitationId),
      )
      return reply.code(204).send()
    },
  })

  fastify.patch('/tenants/me/members/:membershipId/role', {
    schema: {
      tags:     ['members'],
      summary:  'Change a member\'s role',
      security: [{ bearerAuth: [] }],
      body:     updateRoleBody,
    },
    preHandler: ownerOnly,
    handler: async (
      request: FastifyRequest<{ Params: { membershipId: string }; Body: { role: MemberRole } }>,
      reply:   FastifyReply,
    ) => {
      const membership = await teamSvc.updateMemberRole(
        request.ctx!,
        request.params.membershipId,
        request.body.role,
      )
      return reply.send({ membership })
    },
  })

  fastify.delete('/tenants/me/members/:membershipId', {
    schema: {
      tags:     ['members'],
      summary:  'Remove a member from the workspace',
      security: [{ bearerAuth: [] }],
    },
    preHandler: ownerOnly,
    handler: async (
      request: FastifyRequest<{ Params: { membershipId: string } }>,
      reply:   FastifyReply,
    ) => {
      await teamSvc.removeMember(request.ctx!, request.params.membershipId)
      return reply.code(204).send()
    },
  })

  fastify.get('/invitations/:token', {
    schema: {
      tags:    ['members'],
      summary: 'Get invitation details by token (public)',
    },
    handler: async (
      request: FastifyRequest<{ Params: { token: string } }>,
      reply:   FastifyReply,
    ) => {
      const invitation = await withAdmin(
        ({ repos }) => repos.invitations.findByToken(request.params.token),
      )
      if (!invitation) return reply.code(404).send({ error: 'Invitation not found or expired' })

      const tenant = await withAdmin(
        ({ repos }) => repos.tenants.findByIdOrThrow(invitation.tenantId),
      )

      return reply.send({
        email:      invitation.email,
        role:       invitation.role,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        expiresAt:  invitation.expiresAt,
      })
    },
  })

  fastify.post('/invitations/:token/accept', {
    schema: {
      tags:     ['members'],
      summary:  'Accept a workspace invitation',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [authenticate],
    handler: async (
      request: FastifyRequest<{ Params: { token: string } }>,
      reply:   FastifyReply,
    ) => {
      const user = await withAdmin(
        ({ repos }) => repos.users.findByIdOrThrow(request.ctx!.userId),
      )

      const result = await teamSvc.acceptInvitation(
        request.ctx!.userId,
        user.email,
        request.params.token,
      )

      return reply.code(201).send({
        tenant:     result.tenant,
        membership: result.membership,
        nextStep:   'POST /auth/workspace',
        tenantId:   result.tenant.id,
      })
    },
  })
}
