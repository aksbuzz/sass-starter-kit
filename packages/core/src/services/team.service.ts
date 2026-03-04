import { injectable, inject }   from 'inversify'
import {
  withAdmin,
  withTenant,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PlanLimitError,
  type Tenant,
  type Membership,
  type Invitation,
  type MemberRole,
} from '@saas/db'
import type pino from 'pino'
import { TOKENS } from '../container/tokens.js'
import type { RequestContext } from '../types.js'
import { auditMeta } from '../lib/audit-helpers.js'


@injectable()
export class TeamService {
  constructor(
    @inject(TOKENS.Logger) private readonly logger: pino.Logger,
  ) {}

  async inviteMember(
    ctx:  RequestContext,
    data: { email: string; role: MemberRole },
  ): Promise<Invitation> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      if (data.role === 'owner' && ctx.role !== 'owner') {
        throw new ForbiddenError('Only owners can invite other owners')
      }

      const subscription = await repos.subscriptions.findByTenantId(ctx.tenantId!)
      const maxMembers   = (subscription?.plan?.limits as { maxMembers?: number | null } | undefined)?.maxMembers ?? null

      if (maxMembers !== null) {
        const current = await repos.memberships.countActive()
        if (current >= maxMembers) throw new PlanLimitError('members', current, maxMembers)
      }

      const existingMember = await withAdmin(async ({ repos: ar }) => {
        const user = await ar.users.findByEmail(data.email)
        if (!user) return null
        const memberRows = await ar.memberships.findTenantsForUser(user.id)
        return memberRows.find(m => m.tenantId === ctx.tenantId) ?? null
      })

      if (existingMember) {
        throw new ConflictError(`${data.email} is already a member of this workspace`)
      }

      const invitation = await repos.invitations.create({
        tenantId:  ctx.tenantId!,
        email:     data.email,
        role:      data.role,
        invitedBy: ctx.userId,
      })

      await repos.jobs.enqueue({
        type:    'invitation.send',
        payload: { type: 'invitation.send', invitationId: invitation.id },
        queue:   'email',
      })

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'members.invite',
        resourceType: 'Invitation',
        resourceId:   invitation.id,
        after:        { email: data.email, role: data.role },
        metadata:     auditMeta(ctx),
      })

      return invitation
    })
  }

  async acceptInvitation(
    userId:    string,
    userEmail: string,
    token:     string,
  ): Promise<{ tenant: Tenant; membership: Membership }> {
    return withAdmin(async ({ repos }) => {
      const invitation = await repos.invitations.findByTokenOrThrow(token)

      if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
        throw new ForbiddenError('This invitation was sent to a different email address')
      }

      if (invitation.acceptedAt) throw new ConflictError('Invitation already accepted')

      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        throw new ConflictError('This invitation has expired')
      }

      const tenant     = await repos.tenants.findByIdOrThrow(invitation.tenantId)
      const membership = await repos.memberships.create({
        tenantId: invitation.tenantId,
        userId,
        role:     invitation.role,
        status:   'active',
        joinedAt: new Date(),
      })

      await repos.invitations.accept(invitation.id)

      await repos.auditLogs.create({
        tenantId:     invitation.tenantId,
        userId,
        action:       'members.join',
        resourceType: 'Membership',
        resourceId:   membership.id,
        after:        { email: userEmail, role: invitation.role },
      })

      this.logger.info({ userId, tenantId: invitation.tenantId }, 'Invitation accepted')
      return { tenant, membership }
    })
  }

  async updateMemberRole(
    ctx:          RequestContext,
    membershipId: string,
    role:         MemberRole,
  ): Promise<Membership> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      const target = await repos.memberships.findById(membershipId)
      if (!target) throw new NotFoundError('Membership', membershipId)

      if (target.role === 'owner' && role !== 'owner') {
        const ownerCount = await repos.memberships.countByRoleForUpdate('owner')
        if (ownerCount <= 1) {
          throw new ConflictError('Cannot remove the last owner — transfer ownership first')
        }
      }

      const before  = target.role
      const updated = await repos.memberships.updateRole(membershipId, role)

      await repos.sessions.deleteByUserAndTenant(target.userId, ctx.tenantId!)

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'members.update_role',
        resourceType: 'Membership',
        resourceId:   membershipId,
        before:       { role: before },
        after:        { role },
        metadata:     auditMeta(ctx),
      })

      return updated
    })
  }

  async removeMember(ctx: RequestContext, membershipId: string): Promise<void> {
    if (!ctx.tenantId) throw new ForbiddenError('No active workspace')

    await withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async ({ repos }) => {
      const target = await repos.memberships.findById(membershipId)
      if (!target) throw new NotFoundError('Membership', membershipId)

      if (target.role === 'owner') {
        const ownerCount = await repos.memberships.countByRoleForUpdate('owner')
        if (ownerCount <= 1) throw new ConflictError('Cannot remove the last owner')
      }

      await repos.sessions.deleteByUserAndTenant(target.userId, ctx.tenantId!)
      await repos.memberships.delete(membershipId)

      await repos.auditLogs.create({
        tenantId:     ctx.tenantId!,
        userId:       ctx.userId,
        action:       'members.remove',
        resourceType: 'Membership',
        resourceId:   membershipId,
        before:       { userId: target.userId, role: target.role },
        metadata:     auditMeta(ctx),
      })
    })
  }
}
