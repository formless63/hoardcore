import { describe, expect, it, vi } from 'vitest'
import { proxyEndpointSchema, sourceRoutingInputSchema } from './source-routing.schemas'
import { decryptProxyPassword, encryptProxyPassword } from './source-routing-crypto.server'

vi.mock('~/server/config.server', () => ({ getServerConfig: () => ({ BETTER_AUTH_SECRET: 'test-encryption-root-not-a-production-secret' }) }))

describe('source routing contracts and encryption', () => {
  it('accepts internal proxy hosts, rejects embedded secrets and ambiguous paths', () => {
    for (const value of ['http://gluetun:8888', 'https://proxy.example.test:8443']) expect(proxyEndpointSchema.safeParse(value).success).toBe(true)
    for (const value of ['socks5://proxy:1080', 'http://user:password@proxy:8888', 'http://proxy/path', 'http://proxy/?key=secret', 'http://proxy/#secret']) expect(proxyEndpointSchema.safeParse(value).success).toBe(false)
    expect(sourceRoutingInputSchema.safeParse({ sourceId: crypto.randomUUID(), mode: 'http_proxy', endpoint: '' }).success).toBe(false)
    expect(sourceRoutingInputSchema.safeParse({ sourceId: crypto.randomUUID(), mode: 'direct' }).success).toBe(true)
  })
  it('uses randomized authenticated encryption bound to the source', () => {
    const sourceId = crypto.randomUUID()
    const encrypted = encryptProxyPassword('private-password', sourceId)
    expect(JSON.stringify(encrypted)).not.toContain('private-password')
    expect(encryptProxyPassword('private-password', sourceId)).not.toEqual(encrypted)
    expect(decryptProxyPassword(encrypted, sourceId)).toBe('private-password')
    expect(() => decryptProxyPassword(encrypted, crypto.randomUUID())).toThrow('Unable to decrypt')
    expect(() => decryptProxyPassword({ ...encrypted, ciphertext: 'tampered' }, sourceId)).toThrow('Unable to decrypt')
  })
})
