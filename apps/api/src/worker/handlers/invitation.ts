import { withAdmin }    from '@saas/db'
import { sendEmail }    from '../../lib/email.js'
import { config }       from '../../config.js'
import type { JobHandler } from '../job-worker.js'
import type { JobPayload } from '@saas/db'

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// ---------------------------------------------------------------------------
// Fetches the invitation + tenant name from the DB, then sends the invitee
// an email with a tokenized acceptance link.
// ---------------------------------------------------------------------------

export const handleInvitationSend: JobHandler<Extract<JobPayload, { type: 'invitation.send' }>> =
  async (job, logger) => {
    const { invitationId } = job.payload

    const { invitation, tenant } = await withAdmin(async ({ repos }) => {
      const inv = await repos.invitations.findById(invitationId)

      if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
        return { invitation: null, tenant: null }
      }

      const t = await repos.tenants.findByIdOrThrow(inv.tenantId)
      return { invitation: inv, tenant: t }
    })

    if (!invitation || !tenant) {
      logger.warn({ invitationId }, 'Invitation not found, accepted, or expired — skipping')
      return
    }

    const acceptUrl = `${config.WEB_URL}/invitations/${invitation.token}`

    const safeName = escHtml(tenant.name)
    const safeRole = escHtml(invitation.role)
    const safeUrl  = encodeURI(acceptUrl)   // sanitise the URL too
    const expiryDate = new Date(invitation.expiresAt)
      .toLocaleDateString('en-US', { dateStyle: 'long' })

    await sendEmail({
      to:      invitation.email,
      subject: `You've been invited to join ${tenant.name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: sans-serif; max-width: 600px; margin: 40px auto; color: #111;">
          <h2>You're invited to join <strong>${safeName}</strong></h2>
          <p>
            You've been invited to join <strong>${safeName}</strong>
            as a <strong>${safeRole}</strong>.
          </p>
          <p style="margin: 32px 0;">
            <a href="${safeUrl}"
               style="background: #2563eb; color: white; padding: 12px 24px;
                      border-radius: 6px; text-decoration: none; font-weight: 600;">
              Accept invitation
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            This invitation expires on ${escHtml(expiryDate)}.
            If you didn't expect this, you can safely ignore it.
          </p>
        </body>
        </html>
      `,
      text: `You've been invited to join ${tenant.name} as a ${invitation.role}.\n\nAccept: ${acceptUrl}`,
    })

    logger.info({ invitationId, to: invitation.email }, 'Invitation email sent')
  }
