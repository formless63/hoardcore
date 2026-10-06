import { z } from 'zod'

export const proxyEndpointSchema = z.string().trim().max(2048).refine(value => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash
  } catch { return false }
}, 'Use an HTTP or HTTPS proxy URL without credentials, path, query, or fragment')

export const sourceRoutingInputSchema = z.object({
  sourceId: z.uuid(),
  mode: z.enum(['direct', 'http_proxy']),
  endpoint: z.string().trim().max(2048).default(''),
  username: z.string().max(256).refine(value => !/[\r\n:]/u.test(value), 'Proxy username cannot contain a colon or line break').default(''),
  password: z.string().max(4096).default(''),
  clearPassword: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (value.mode === 'http_proxy' && !proxyEndpointSchema.safeParse(value.endpoint).success)
    ctx.addIssue({ code: 'custom', path: ['endpoint'], message: 'Enter a credential-free HTTP or HTTPS proxy URL' })
  if (value.password && value.clearPassword)
    ctx.addIssue({ code: 'custom', path: ['password'], message: 'Choose either a replacement password or clear password' })
})

export interface SourceRoutingSummary {
  mode: 'direct' | 'http_proxy'
  endpoint: string
  username: string
  hasPassword: boolean
}

/** Stored only in PostgreSQL; never part of the browser-facing summary. */
export interface EncryptedProxyPassword { ciphertext: string; nonce: string; authTag: string }

/** Server-only credential-bearing transport configuration. */
export interface SourceProxy { endpoint: string; username: string; password: string }
