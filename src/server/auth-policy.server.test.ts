import { describe, expect, it } from 'vitest'
import { isMagicLinkVerification, magicLinkSessionExpiry, MAGIC_LINK_SESSION_SECONDS, OIDC_SESSION_SECONDS } from './auth-policy.server'

describe('sign-in session policy', () => {
  it('applies the short lifetime only to magic-link verification', () => {
    expect(isMagicLinkVerification('/magic-link/verify')).toBe(true)
    expect(isMagicLinkVerification('/api/auth/magic-link/verify')).toBe(true)
    expect(isMagicLinkVerification('/callback/oidc')).toBe(false)
    expect(isMagicLinkVerification(undefined)).toBe(false)
    const createdAt = new Date('2026-09-16T00:00:00.000Z')
    expect(magicLinkSessionExpiry(createdAt).toISOString()).toBe('2026-09-17T00:00:00.000Z')
    expect(MAGIC_LINK_SESSION_SECONDS).toBe(86_400)
    expect(OIDC_SESSION_SECONDS).toBe(2_592_000)
  })
})
