import { describe, expect, it } from 'vitest'
import { describeCron, formatScheduledDate, nextCronRun, validateCollectionCron } from './source-schedule'

describe('catalog source cron schedules', () => {
  it('evaluates wall-clock schedules in the selected timezone', () => {
    expect(nextCronRun('0 9,21 * * *', 'America/New_York', new Date('2026-09-19T14:00:00Z')).toISOString()).toBe('2026-09-20T01:00:00.000Z')
    expect(describeCron('0 9,21 * * *', 'America/New_York')).toContain('America/New_York')
    expect(formatScheduledDate('2026-09-20T01:00:00Z', 'America/New_York')).toContain('9:00 PM')
  })

  it('rejects invalid zones, invalid expressions, and aggressive schedules', () => {
    expect(validateCollectionCron('0 9,21 * * *', 'Not/AZone')).toContain('IANA')
    expect(validateCollectionCron('not cron', 'UTC')).toContain('five-field')
    expect(validateCollectionCron('*/5 * * * *', 'UTC')).toContain('six hours')
  })
})
