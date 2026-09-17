import { ntfyEndpointSchema } from './alerts.schemas'

/** A deployment token is only sent to the exact origin the operator pinned. */
export function ntfyAuthorizationForEndpoint(endpoint: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = env.NTFY_ACCESS_TOKEN?.trim()
  const configuredOrigin = env.NTFY_AUTH_ORIGIN?.trim()
  if (!token && !configuredOrigin) return undefined
  if (!token || !configuredOrigin) throw new Error('NTFY_ACCESS_TOKEN and NTFY_AUTH_ORIGIN must be configured together')
  const allowedOrigin = ntfyEndpointSchema.parse(configuredOrigin)
  if (ntfyEndpointSchema.parse(endpoint) !== allowedOrigin) return undefined
  return `Bearer ${token}`
}
