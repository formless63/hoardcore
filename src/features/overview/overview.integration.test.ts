import { afterAll, describe, expect, it } from 'vitest'
import { closeDatabase } from '~/server/db/index.server'
import { getOverviewFromDatabase } from './overview.server'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl

describe.skipIf(!testDatabaseUrl)('inventory overview SQL', () => {
  afterAll(async () => { await closeDatabase() })

  it('returns serializable inventory and activity on a migrated database', async () => {
    const overview = await getOverviewFromDatabase(7)
    expect(overview.days).toBe(7)
    expect(overview.totals.tracked).toBeGreaterThanOrEqual(0)
    expect(overview.activity).toHaveLength(14)
    expect(overview.sources.every((source) => source.lastObservedAt === null || !Number.isNaN(Date.parse(source.lastObservedAt)))).toBe(true)
    expect(overview.changes.every((change) => !Number.isNaN(Date.parse(change.observedAt)))).toBe(true)
  })
})
