import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { user } from '~/server/db/schema'
import { emptyListingFilters } from './listing-filters'
import { deleteListingViewFromDatabase, listSavedViewsFromDatabase, saveListingViewToDatabase } from './saved-views.server'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip

describeWithDatabase('saved listing views', () => {
  const firstUserId = `saved-view-test-${crypto.randomUUID()}`
  const secondUserId = `saved-view-test-${crypto.randomUUID()}`
  const db = () => getDatabase()

  beforeAll(async () => {
    const now = new Date()
    await db().insert(user).values([
      { id: firstUserId, name: 'View test A', email: `${firstUserId}@example.test`, emailVerified: false, createdAt: now, updatedAt: now },
      { id: secondUserId, name: 'View test B', email: `${secondUserId}@example.test`, emailVerified: false, createdAt: now, updatedAt: now },
    ])
  })
  afterAll(async () => { await db().delete(user).where(inArray(user.id, [firstUserId, secondUserId])); await closeDatabase() })

  it('persists named versioned filters and scopes reads, updates, and deletion to the owner', async () => {
    const first = await saveListingViewToDatabase(db(), firstUserId, 'Bargains', { ...emptyListingFilters, maxPrice: 100, minDiscountPercent: 30 })
    expect((await listSavedViewsFromDatabase(db(), firstUserId))[0]?.filters.minDiscountPercent).toBe(30)
    expect(await listSavedViewsFromDatabase(db(), secondUserId)).toEqual([])
    const updated = await saveListingViewToDatabase(db(), firstUserId, 'Bargains', { ...emptyListingFilters, maxPrice: 80 })
    expect(updated.id).toBe(first.id)
    expect((await listSavedViewsFromDatabase(db(), firstUserId))[0]?.filters.maxPrice).toBe(80)
    expect(await deleteListingViewFromDatabase(db(), secondUserId, first.id)).toEqual({ deleted: false })
    expect(await deleteListingViewFromDatabase(db(), firstUserId, first.id)).toEqual({ deleted: true })
    expect(await listSavedViewsFromDatabase(db(), firstUserId)).toEqual([])
  })
})
