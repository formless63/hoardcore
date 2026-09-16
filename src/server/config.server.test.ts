import { describe, expect, it } from 'vitest'
import { normalizeOidcDiscoveryUrl, parseServerConfig } from './config.server'

describe('parseServerConfig', () => {
  it('accepts a PostgreSQL connection URL without exposing unrelated environment values', () => {
    expect(
      parseServerConfig({
        DATABASE_URL: 'postgresql://hoardcore:secret@localhost:5432/hoardcore',
        UNRELATED_SECRET: 'do-not-return',
      }),
    ).toEqual({
      DATABASE_URL: 'postgresql://hoardcore:secret@localhost:5432/hoardcore',
    })
  })

  it('reports a missing database URL by setting name', () => {
    expect(() => parseServerConfig({})).toThrow(
      'Invalid server configuration:\n- DATABASE_URL: is required',
    )
  })

  it('rejects non-PostgreSQL URLs', () => {
    expect(() => parseServerConfig({ DATABASE_URL: 'https://example.com/database' })).toThrow(
      'DATABASE_URL: must use the postgres:// or postgresql:// protocol',
    )
  })

  it('requires a complete OIDC configuration and normalizes its discovery URL', () => {
    expect(() =>
      parseServerConfig({
        DATABASE_URL: 'postgresql://localhost/hoardcore',
        OIDC_ISSUER: 'https://identity.example.test/',
      }),
    ).toThrow('OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET must be configured together')
    expect(normalizeOidcDiscoveryUrl('https://identity.example.test/')).toBe(
      'https://identity.example.test/.well-known/openid-configuration',
    )
  })

  it('treats blank optional OIDC values from the example environment as unset', () => {
    const config = parseServerConfig({
      DATABASE_URL: 'postgresql://localhost/hoardcore',
      OIDC_ISSUER: '',
      OIDC_CLIENT_ID: '',
      OIDC_CLIENT_SECRET: '',
    })
    expect(config.OIDC_ISSUER).toBeUndefined()
    expect(config.OIDC_CLIENT_ID).toBeUndefined()
    expect(config.OIDC_CLIENT_SECRET).toBeUndefined()
  })
})
