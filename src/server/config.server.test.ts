import { describe, expect, it } from 'vitest'
import { parseServerConfig } from './config.server'

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
})
