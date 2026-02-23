import { sendEmail }    from '../../lib/email.js'
import type { JobHandler } from '../job-worker.js'
import type { JobPayload } from '@saas/db'

// ---------------------------------------------------------------------------
// Generic transactional email sender. Supports a small registry of named
// templates; callers pass a template key + variables and this handler
// renders the final HTML + text before handing off to sendEmail().
// ---------------------------------------------------------------------------

type Payload = Extract<JobPayload, { type: 'email.send' }>

type TemplateRenderer = (vars: Record<string, unknown>) => { html: string; text: string }

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// Blocks javascript: and data: URIs that could execute scripts in email clients.
function safeUrl(v: unknown): string {
  const url = String(v ?? '')
  if (/^javascript:/i.test(url) || /^data:/i.test(url)) return '#'
  return encodeURI(url)
}

const TEMPLATES: Record<string, TemplateRenderer> = {
  generic: (vars) => {
    const title   = esc(vars['title']    ?? '')
    const body    = esc(vars['body']     ?? '')
    const footer  = esc(vars['footer']  ?? '')
    const ctaLabel = vars['ctaLabel'] ? esc(vars['ctaLabel']) : null
    const ctaUrl   = vars['ctaUrl']   ? safeUrl(vars['ctaUrl']) : null

    const ctaBlock = ctaLabel && ctaUrl
      ? `<p style="margin:32px 0;">
           <a href="${ctaUrl}"
              style="background:#2563eb;color:white;padding:12px 24px;
                     border-radius:6px;text-decoration:none;font-weight:600;">
             ${ctaLabel}
           </a>
         </p>`
      : ''

    const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;color:#111;">
  <h2>${title}</h2>
  <p style="line-height:1.6;">${body}</p>
  ${ctaBlock}
  ${footer ? `<p style="color:#6b7280;font-size:14px;">${footer}</p>` : ''}
</body>
</html>`

    const text = [title, body, ctaLabel && ctaUrl ? `${ctaLabel}: ${ctaUrl}` : null, footer]
      .filter(Boolean).join('\n\n')

    return { html, text }
  },

  welcome: (vars) => {
    const name         = esc(vars['name']         ?? 'there')
    const appName      = esc(vars['appName']      ?? 'our app')
    const dashboardUrl = vars['dashboardUrl'] ? safeUrl(vars['dashboardUrl']) : '#'

    const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;color:#111;">
  <h2>Welcome to ${appName}, ${name}!</h2>
  <p style="line-height:1.6;">
    Your account is set up and ready to go. Click below to get started.
  </p>
  <p style="margin:32px 0;">
    <a href="${dashboardUrl}"
       style="background:#2563eb;color:white;padding:12px 24px;
              border-radius:6px;text-decoration:none;font-weight:600;">
      Go to dashboard
    </a>
  </p>
</body>
</html>`

    const text = `Welcome to ${String(vars['appName'] ?? 'our app')}, ${String(vars['name'] ?? 'there')}!\n\nGet started: ${dashboardUrl}`

    return { html, text }
  },
}

export const handleEmailSend: JobHandler<Payload> = async (job, logger) => {
  const { to, subject, template, vars } = job.payload

  const renderer = TEMPLATES[template]
  if (!renderer) {
    throw new Error(`Unknown email template: "${template}"`)
  }

  const { html, text } = renderer(vars)

  await sendEmail({ to, subject, html, text })

  logger.info({ to, template }, 'Transactional email sent')
}
