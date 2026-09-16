import nodemailer from 'nodemailer'
import type { ServerConfig } from './config.server'

export function isSmtpConfigured(config: ServerConfig): boolean {
  return Boolean(config.SMTP_HOST && config.SMTP_PORT && config.SMTP_USER && config.SMTP_PASSWORD && config.SMTP_FROM)
}

export async function sendMagicLinkEmail(config: ServerConfig, email: string, url: string): Promise<void> {
  if (!isSmtpConfigured(config)) throw new Error('SMTP is not configured')
  const secure = config.SMTP_SECURE === 'true' || (config.SMTP_SECURE === undefined && config.SMTP_PORT === 465)
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure,
    requireTLS: !secure,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  })
  try {
    await transport.sendMail({
      from: { name: 'Hoardcore', address: config.SMTP_FROM! },
      to: email,
      subject: 'Sign in to Hoardcore',
      text: `Use this one-time link to sign in to Hoardcore:\n\n${url}\n\nThe link expires in 10 minutes. If you did not request it, you can ignore this email.`,
    })
  } finally {
    transport.close()
  }
}
