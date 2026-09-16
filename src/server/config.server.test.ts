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
      MEDIA_CAPTURE_ENABLED: 'false',
    })
  })

  it('requires an explicit opt-in for media acquisition', () => {
    expect(parseServerConfig({ DATABASE_URL: 'postgresql://localhost/hoardcore' }).MEDIA_CAPTURE_ENABLED).toBe('false')
    expect(parseServerConfig({ DATABASE_URL: 'postgresql://localhost/hoardcore', MEDIA_CAPTURE_ENABLED: 'true' }).MEDIA_CAPTURE_ENABLED).toBe('true')
    expect(() => parseServerConfig({ DATABASE_URL: 'postgresql://localhost/hoardcore', MEDIA_CAPTURE_ENABLED: 'yes' })).toThrow('MEDIA_CAPTURE_ENABLED')
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

  it('requires complete SMTP settings and OIDC before enabling email fallback', () => {
    const base = {
      DATABASE_URL: 'postgresql://localhost/hoardcore',
      OIDC_ISSUER: 'https://identity.example.test',
      OIDC_CLIENT_ID: 'client',
      OIDC_CLIENT_SECRET: 'secret',
    }
    expect(() => parseServerConfig({ ...base, SMTP_HOST: 'smtp.example.test' })).toThrow('SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM must be configured together')
    expect(() => parseServerConfig({
      DATABASE_URL: base.DATABASE_URL,
      SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_USER: 'operator', SMTP_PASSWORD: 'secret', SMTP_FROM: 'login@example.test',
    })).toThrow('Magic-link SMTP requires OIDC')
    const config = parseServerConfig({ ...base, SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_USER: 'operator', SMTP_PASSWORD: 'secret', SMTP_FROM: 'login@example.test' })
    expect(config.SMTP_PORT).toBe(587)
  })

  it('allows only same-origin provider icon paths', () => {
    const base = { DATABASE_URL: 'postgresql://localhost/hoardcore' }
    expect(parseServerConfig({ ...base, OIDC_PROVIDER_ICON_URL: '/identity-icon.svg' }).OIDC_PROVIDER_ICON_URL).toBe('/identity-icon.svg')
    expect(() => parseServerConfig({ ...base, OIDC_PROVIDER_ICON_URL: 'https://example.test/icon.svg' })).toThrow('same-origin')
    expect(() => parseServerConfig({ ...base, OIDC_PROVIDER_ICON_URL: '//example.test/icon.svg' })).toThrow('same-origin')
  })
})
