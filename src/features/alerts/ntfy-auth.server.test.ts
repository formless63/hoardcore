import { describe, expect, it } from 'vitest'
import { ntfyAuthorizationForEndpoint } from './ntfy-auth.server'

describe('ntfy deployment token', () => {
  const env = { NTFY_ACCESS_TOKEN: 'private-token', NTFY_AUTH_ORIGIN: 'https://ntfy.example.test' } as NodeJS.ProcessEnv

  it('sends a bearer token only to the pinned HTTPS origin', () => {
    expect(ntfyAuthorizationForEndpoint('https://ntfy.example.test', env)).toBe('Bearer private-token')
    expect(ntfyAuthorizationForEndpoint('https://other.example.test', env)).toBeUndefined()
  })

  it('supports an installation with no token', () => {
    expect(ntfyAuthorizationForEndpoint('https://ntfy.example.test', {})).toBeUndefined()
  })

  it('rejects partial or unsafe token configuration', () => {
    expect(() => ntfyAuthorizationForEndpoint('https://ntfy.example.test', { NTFY_ACCESS_TOKEN: 'private-token' })).toThrow('configured together')
    expect(() => ntfyAuthorizationForEndpoint('https://ntfy.example.test', { ...env, NTFY_AUTH_ORIGIN: 'http://ntfy.example.test' })).toThrow()
  })
})
