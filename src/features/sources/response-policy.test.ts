import { describe, expect, it } from 'vitest'
import { classifyResponse, defaultResponsePolicy, responseDecision, responsePolicySchema } from './response-policy'

describe('source response rules', () => {
  it('classifies access controls, throttling and transient failures without treating 304 as failure', () => {
    expect([429, 401, 403, 503, 408, 425, 302, 404, 200, 304].map(classifyResponse)).toEqual([
      'throttled', 'access_denied', 'access_denied', 'server_error', 'server_error', 'server_error', 'invalid_response', 'invalid_response', null, null,
    ])
  })
  it('escalates 429 cooldowns and requires review after repeated probes', () => {
    const now = Date.parse('2026-10-01T00:00:00Z')
    const decisions = [1, 2, 3, 4].map(strikes => responseDecision(defaultResponsePolicy, 'throttled', strikes, '60', now))
    expect(decisions.map(value => (value.until.getTime() - now) / 3_600_000)).toEqual([24, 72, 168, 168])
    expect(decisions.map(value => value.paused)).toEqual([false, false, true, true])
  })
  it('honors longer source-directed delays, HTTP dates and malformed Retry-After values', () => {
    const now = Date.parse('2026-10-01T00:00:00Z')
    expect(responseDecision(defaultResponsePolicy, 'throttled', 1, '864000', now).until.getTime() - now).toBe(864_000_000)
    expect(responseDecision(defaultResponsePolicy, 'throttled', 1, 'Sat, 03 Oct 2026 00:00:00 GMT', now).until.toISOString()).toBe('2026-10-03T00:00:00.000Z')
    expect(responseDecision(defaultResponsePolicy, 'throttled', 1, 'invalid', now).until.toISOString()).toBe('2026-10-02T00:00:00.000Z')
  })
  it('validates policy limits and permits stricter reactions', () => {
    expect(responsePolicySchema.safeParse({ minimumDelaySeconds: 1 }).success).toBe(false)
    expect(responsePolicySchema.safeParse({ throttleCooldownHours: 1 }).success).toBe(false)
    expect(responsePolicySchema.safeParse({ throttleCooldownHours: 300, throttleMaxHours: 168 }).success).toBe(false)
    expect(responseDecision(defaultResponsePolicy, 'access_denied', 0, null).paused).toBe(true)
    expect(responseDecision(defaultResponsePolicy, 'server_error', 0, null).paused).toBe(false)
  })
})
