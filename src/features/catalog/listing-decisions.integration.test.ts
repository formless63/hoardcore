import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { catalogProducts, catalogSources, catalogVariants, listingDecisions, sourceListings, user } from '~/server/db/schema'
import { addSharedListingDecisionNote, listListingDecisionHistory, saveListingDecision } from './listing-decisions.server'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip
const suffix = `decision-history-${Date.now()}-${Math.random().toString(36).slice(2)}`
let sourceId = ''; let listingId = ''
const firstUserId = `${suffix}-first`; const secondUserId = `${suffix}-second`

describeWithDatabase('listing decision history', () => {
  const db = () => getDatabase()
  beforeEach(async () => {
    const now = new Date()
    await db().insert(user).values([{ id: firstUserId, name: 'First operator', email: `${firstUserId}@example.test`, createdAt: now, updatedAt: now }, { id: secondUserId, name: 'Second operator', email: `${secondUserId}@example.test`, createdAt: now, updatedAt: now }])
    const [source] = await db().insert(catalogSources).values({ moduleId: 'test', displayName: suffix, sourceKey: suffix, config: {} }).returning({ id: catalogSources.id }); sourceId = source!.id
    const [product] = await db().insert(catalogProducts).values({ productKey: `${suffix}-product`, title: 'Decision fixture', tags: [] }).returning({ id: catalogProducts.id })
    const [variant] = await db().insert(catalogVariants).values({ productId: product!.id, variantKey: `${suffix}-variant`, title: 'Default' }).returning({ id: catalogVariants.id })
    const [listing] = await db().insert(sourceListings).values({ sourceId, productId: product!.id, variantId: variant!.id, listingKey: `${suffix}-listing`, url: `https://example.test/${suffix}` }).returning({ id: sourceListings.id }); listingId = listing!.id
  })
  afterEach(async () => { if (sourceId) await db().delete(catalogSources).where(eq(catalogSources.id, sourceId)); await db().delete(user).where(eq(user.id, firstUserId)); await db().delete(user).where(eq(user.id, secondUserId)); sourceId = ''; listingId = '' })
  afterAll(async () => { await closeDatabase() })

  it('appends attributable state changes and shared notes without exposing private notes', async () => {
    await saveListingDecision(db(), firstUserId, { listingId, state: 'interesting', note: 'Only first operator can read this', expectedQuantity: 2 })
    await saveListingDecision(db(), firstUserId, { listingId, state: 'watch', note: 'Updated private note', expectedQuantity: 3 })
    await db().insert(listingDecisions).values({ userId: secondUserId, listingId, state: 'pass', note: 'Legacy private note' })
    await saveListingDecision(db(), secondUserId, { listingId, state: 'ignore', note: 'Second private note', expectedQuantity: null })
    await addSharedListingDecisionNote(db(), secondUserId, { listingId, body: 'Wait for the next price observation.' })

    const history = await listListingDecisionHistory(db(), listingId)
    expect(history).toHaveLength(4)
    expect(history.filter((item) => item.kind === 'state')).toEqual(expect.arrayContaining([
      expect.objectContaining({ authorName: 'First operator', fromState: null, toState: 'interesting' }),
      expect.objectContaining({ authorName: 'First operator', fromState: 'interesting', toState: 'watch' }),
      expect.objectContaining({ authorName: 'Second operator', fromState: 'pass', toState: 'ignore' }),
    ]))
    expect(history).toContainEqual(expect.objectContaining({ kind: 'note', authorName: 'Second operator', body: 'Wait for the next price observation.' }))
    expect(JSON.stringify(history)).not.toContain('private note')
  })
})
