import nodemailer from 'nodemailer'
import { config }  from '../config.js'


export interface EmailMessage {
  to:      string
  subject: string
  html:    string
  text?:   string
}

let _transport: ReturnType<typeof nodemailer.createTransport> | null = null

function getTransport(): ReturnType<typeof nodemailer.createTransport> {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host:   config.SMTP_HOST,
      port:   config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth:   config.SMTP_USER
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
        : undefined,
    })
  }
  return _transport
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (!config.SMTP_HOST) {
    console.log(
      '\n📧  [DEV EMAIL — set SMTP_* vars to send real mail]\n' +
      `  To:      ${msg.to}\n` +
      `  Subject: ${msg.subject}\n`
      // + `  Body:    ${msg.text ?? msg.html.replace(/<[^>]+>/g, ' ').trim()}\n`,
    )
    return
  }

  await getTransport().sendMail({
    from:    config.SMTP_FROM,
    to:      msg.to,
    subject: msg.subject,
    html:    msg.html,
    text:    msg.text,
  })
}
