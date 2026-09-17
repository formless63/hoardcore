import { describe, expect, it } from 'vitest'
import { overviewTimestamp } from './overview.server'

describe('overview timestamp normalization', () => {
  it('accepts both raw-SQL strings and Date objects', () => {
    const instant = '2026-09-17T02:30:00.000Z'
    expect(overviewTimestamp(instant)).toBe(instant)
    expect(overviewTimestamp(new Date(instant))).toBe(instant)
    expect(overviewTimestamp(null)).toBeNull()
  })
})
