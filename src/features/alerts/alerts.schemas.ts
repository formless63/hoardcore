import { z } from 'zod'
import { isPublicNtfyAddress } from './ntfy-network'

const disallowedHost = /^(?:localhost|localhost\.localdomain|0\.0\.0\.0|127(?:\.\d{1,3}){3}|::1)$/iu

function isPrivateLiteral(hostname: string) {
  const host = hostname.replace(/^\[|\]$/gu, '').toLowerCase()
  if (host.includes(':')) return !isPublicNtfyAddress(host, 6)
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127 || parts[0] === 169 && parts[1] === 254 || parts[0] === 192 && (parts[1] === 0 || parts[1] === 168) || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)
}

/**
 * Alert endpoints are deliberately public HTTPS origins. This avoids turning a
 * per-user setting into a general-purpose server-side request primitive.
 * Self-hosted ntfy installations should be published behind their normal TLS
 * ingress rather than addressed through loopback/private container names.
 */
export const ntfyEndpointSchema = z.string().trim().url().transform((value, context) => {
  const endpoint = new URL(value)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' || endpoint.port && endpoint.port !== '443') {
    context.addIssue({ code: 'custom', message: 'Use a public HTTPS ntfy origin without a path, credentials, query, or fragment.' })
  }
  if (disallowedHost.test(endpoint.hostname) || endpoint.hostname.endsWith('.localhost') || isPrivateLiteral(endpoint.hostname)) {
    context.addIssue({ code: 'custom', message: 'Loopback and private-network endpoints are not permitted.' })
  }
  return endpoint.origin
})

export const ntfyTopicSchema = z.string().trim().min(1).max(128)
  .regex(/^[A-Za-z0-9_-]+$/u, 'Use letters, numbers, underscores, or hyphens for the topic.')

export const notificationSettingsInputSchema = z.object({
  enabled: z.boolean(),
  endpoint: ntfyEndpointSchema,
  topic: z.string().trim().max(128).optional().default(''),
}).superRefine((value, context) => {
  if (value.enabled && !ntfyTopicSchema.safeParse(value.topic).success) {
    context.addIssue({ code: 'custom', path: ['topic'], message: 'A valid topic is required before notifications can be enabled.' })
  }
})

export type NotificationSettingsInput = z.output<typeof notificationSettingsInputSchema>
