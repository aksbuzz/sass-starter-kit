import { describe, it, expect, vi, beforeEach } from 'vitest'
import pino from 'pino'

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }))

vi.mock('@saas/db', () => ({}))
vi.mock('../../lib/email.js', () => ({ sendEmail: mockSendEmail }))

vi.mock('../../config.js', () => ({ config: { SMTP_HOST: 'smtp.test' } }))

import { handleEmailSend } from '../../worker/handlers/email.js'

const logger = pino({ level: 'silent' })

const fakeJob = (template: string, vars: Record<string, unknown> = {}) => ({
  id:          'job-1',
  queue:       'email',
  type:        'email.send',
  payload:     {
    type:     'email.send' as const,
    to:       'user@example.com',
    subject:  'Test subject',
    template,
    vars,
  },
  status:      'processing' as const,
  priority:    0,
  attempts:    1,
  maxAttempts: 3,
  runAt:       new Date(),
  createdAt:   new Date(),
  updatedAt:   new Date(),
})

describe('handleEmailSend', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the generic template and calls sendEmail', async () => {
    await handleEmailSend(
      fakeJob('generic', { title: 'Hello', body: 'World', ctaLabel: 'Click', ctaUrl: 'https://example.com' }) as never,
      logger,
    )

    expect(mockSendEmail).toHaveBeenCalledOnce()
    const arg = mockSendEmail.mock.calls[0]![0] as { to: string; subject: string; html: string; text: string }
    expect(arg.to).toBe('user@example.com')
    expect(arg.subject).toBe('Test subject')
    expect(arg.html).toContain('Hello')
    expect(arg.html).toContain('World')
    expect(arg.html).toContain('https://example.com')
  })

  it('renders the welcome template', async () => {
    await handleEmailSend(
      fakeJob('welcome', { name: 'Alice', appName: 'Acme', dashboardUrl: 'https://app.acme.com' }) as never,
      logger,
    )

    const arg = mockSendEmail.mock.calls[0]![0] as { html: string; text: string }
    expect(arg.html).toContain('Alice')
    expect(arg.html).toContain('Acme')
    expect(arg.text).toContain('https://app.acme.com')
  })

  it('HTML-escapes variables to prevent XSS', async () => {
    await handleEmailSend(
      fakeJob('generic', { title: '<script>alert(1)</script>', body: 'safe' }) as never,
      logger,
    )

    const arg = mockSendEmail.mock.calls[0]![0] as { html: string }
    expect(arg.html).not.toContain('<script>')
    expect(arg.html).toContain('&lt;script&gt;')
  })

  it('throws for an unknown template so the job can be retried', async () => {
    await expect(
      handleEmailSend(fakeJob('does_not_exist') as never, logger),
    ).rejects.toThrow('Unknown email template: "does_not_exist"')

    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
