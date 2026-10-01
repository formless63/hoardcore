import { z } from 'zod'

export const responseEventTypes = ['throttled', 'access_denied', 'server_error', 'timeout', 'network_error', 'invalid_response', 'recovered'] as const
export type ResponseEventType = typeof responseEventTypes[number]
export const responseEventLabels: Record<ResponseEventType, string> = {
  throttled: '429 · rate limited', access_denied: '401 / 403 · access denied',
  server_error: '5xx / 408 / 425 · temporary failure', timeout: 'Request timeout',
  network_error: 'Network failure', invalid_response: 'Other unsuccessful response', recovered: 'Complete collection recovered',
}
const hours = z.number().min(1).max(8760)
const rule = z.object({ action: z.enum(['cooldown', 'pause']), cooldownHours: hours })
export const responsePolicySchema = z.object({
  minimumDelaySeconds: z.number().int().min(10).max(3600).default(10),
  minimumScanHours: hours.default(24),
  throttleCooldownHours: hours.min(24).default(24),
  throttleMultiplier: z.number().min(1).max(10).default(3),
  throttleMaxHours: hours.min(24).default(168),
  throttlePauseAfter: z.number().int().min(1).max(10).default(3),
  access_denied: rule.default({ action: 'pause', cooldownHours: 72 }),
  server_error: rule.default({ action: 'cooldown', cooldownHours: 6 }),
  timeout: rule.default({ action: 'cooldown', cooldownHours: 6 }),
  network_error: rule.default({ action: 'cooldown', cooldownHours: 6 }),
  invalid_response: rule.default({ action: 'pause', cooldownHours: 24 }),
}).refine(p => p.throttleMaxHours >= p.throttleCooldownHours, {
  path: ['throttleMaxHours'], message: 'Maximum cooldown must be at least the initial cooldown',
})
export type ResponsePolicy = z.infer<typeof responsePolicySchema>
export const defaultResponsePolicy = responsePolicySchema.parse({})

export function classifyResponse(status: number): Exclude<ResponseEventType, 'recovered' | 'timeout' | 'network_error'> | null {
  if (status === 429) return 'throttled'
  if (status === 401 || status === 403) return 'access_denied'
  if (status >= 500 || status === 408 || status === 425) return 'server_error'
  if (status >= 300 && status !== 304 || status < 200) return 'invalid_response'
  return null
}

export function responseDecision(policy: ResponsePolicy, event: Exclude<ResponseEventType, 'recovered'>, strikes: number, retryAfter: string | null, now = Date.now()) {
  const sourceSeconds = retryAfter === null || retryAfter.trim() === '' ? NaN : Number(retryAfter)
  const sourceUntil = Number.isFinite(sourceSeconds) && sourceSeconds >= 0
    ? now + sourceSeconds * 1000 : retryAfter ? Date.parse(retryAfter) : 0
  const durationHours = event === 'throttled'
    ? Math.min(policy.throttleMaxHours, policy.throttleCooldownHours * policy.throttleMultiplier ** Math.max(0, strikes - 1))
    : policy[event].cooldownHours
  return {
    until: new Date(Math.max(now + durationHours * 3_600_000, Number.isFinite(sourceUntil) ? sourceUntil : 0)),
    paused: event === 'throttled' ? strikes >= policy.throttlePauseAfter : policy[event].action === 'pause',
  }
}
