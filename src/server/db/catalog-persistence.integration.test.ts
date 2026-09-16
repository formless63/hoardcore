import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import type { NormalizedCatalogRecord } from '~/modules/types'
import { getCatalogListingDetail } from './catalog-detail.server'
import { persistCatalogSnapshot } from './catalog-persistence.server'
import { closeDatabase, getDatabase } from './index.server'
import { catalogProducts, catalogSources, collectionRuns, sourceEvidence, sourceListingObservations, sourceListings } from './schema'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl

function record(suffix: string, price: number, available = true): NormalizedCatalogRecord {
  return {
    product: { productKey: `integration-product-${suffix}`, title: `Synthetic product ${suffix}`, tags: ['test'] },
    variant: { variantKey: `integration-variant-${suffix}`, productKey: `integration-product-${suffix}`, title: 'Default', price, currency: 'USD', available },
    listing: { listingKey: `integration-listing-${suffix}`, sourceKey: 'integration-source', productKey: `integration-product-${suffix}`, variantKey: `integration-variant-${suffix}`, url: `https://example.test/items/${suffix}`, current: { title: `Synthetic product ${suffix}`, price, currency: 'USD', available }, observedAt: '2026-09-16T05:00:00Z' },
  }
}

describeWithDatabase('catalog snapshot persistence and listing history', () => {
  let sourceId: string | undefined
  let runId: string
  const db = () => getDatabase()

  beforeEach(async () => {
    const [source] = await db().insert(catalogSources).values({ moduleId: 'test', displayName: 'Integration source', sourceKey: `integration-${Date.now()}-${Math.random()}` }).returning({ id: catalogSources.id })
    sourceId = source.id
    const [run] = await db().insert(collectionRuns).values({ sourceId, status: 'succeeded' }).returning({ id: collectionRuns.id })
    runId = run.id
  })

  afterEach(async () => {
    if (sourceId) await db().delete(catalogSources).where(eq(catalogSources.id, sourceId))
    await db().delete(catalogProducts).where(like(catalogProducts.productKey, 'integration-product-%'))
    sourceId = undefined
  })

  afterAll(async () => { await closeDatabase() })

  it('reconciles current state, appends observations, and shares one run evidence capture', async () => {
    const first = record('one', 12)
    const second = record('two', 24)
    const persisted = await persistCatalogSnapshot(db(), sourceId!, [first, second], { runId, observedAt: new Date('2026-09-16T05:00:00Z'), evidence: { payload: { fixture: 'shared' }, contentType: 'application/json' } })
    await persistCatalogSnapshot(db(), sourceId!, [{ ...first, product: { ...first.product, title: 'Synthetic product one revised' }, listing: { ...first.listing, current: { ...first.listing.current, price: 15, available: false } } }], { runId, observedAt: new Date('2026-09-16T06:00:00Z') })

    const evidence = await db().select().from(sourceEvidence).where(eq(sourceEvidence.sourceId, sourceId!))
    const observations = await db().select().from(sourceListingObservations).where(inArray(sourceListingObservations.listingId, persisted.map((item) => item.listingId)))
    expect(evidence).toHaveLength(1)
    expect(observations).toHaveLength(3)
    expect(observations.filter((item) => item.evidenceId === evidence[0]!.id)).toHaveLength(2)

    const products = await db().select().from(catalogProducts).where(eq(catalogProducts.productKey, first.product.productKey))
    expect(products).toHaveLength(1)
    expect(products[0]!.title).toBe('Synthetic product one revised')
  })

  it('returns listing detail with newest observation first and run-level evidence', async () => {
    const item = record('detail', 31)
    item.listing.current.compareAtPrice = 44
    await persistCatalogSnapshot(db(), sourceId!, [item], { runId, observedAt: new Date('2026-09-16T05:00:00Z'), evidence: { payload: { page: 1 }, contentType: 'application/json' } })
    await persistCatalogSnapshot(db(), sourceId!, [{ ...item, listing: { ...item.listing, current: { ...item.listing.current, price: 35 } } }], { runId, observedAt: new Date('2026-09-16T07:00:00Z') })
    const listing = await db().select().from(sourceListings).where(eq(sourceListings.listingKey, item.listing.listingKey))
    const detail = await getCatalogListingDetail(db(), listing[0]!.id)
    expect(detail?.current.price).toBe('35.00')
    expect(detail?.current.compareAtPrice).toBe('44.00')
    expect(detail?.observations[0]?.compareAtPrice).toBe('44.00')
    expect(detail?.observations).toHaveLength(2)
    expect(detail?.observations[0]?.observedAt.toISOString()).toBe('2026-09-16T07:00:00.000Z')
    expect(detail?.observations[1]?.evidence?.run?.id).toBe(runId)
    expect(detail?.observations[1]?.evidence?.payload).toContain('page')
  })

  it('is idempotent when a durable collection run is retried', async () => {
    const item = record('retry', 42)
    const snapshot = {
      runId,
      observedAt: new Date('2026-09-16T08:00:00Z'),
      evidence: { payload: { retry: true }, contentType: 'application/json' },
    }

    await persistCatalogSnapshot(db(), sourceId!, [item], snapshot)
    await persistCatalogSnapshot(db(), sourceId!, [item], snapshot)

    const listing = await db()
      .select({ id: sourceListings.id })
      .from(sourceListings)
      .where(eq(sourceListings.listingKey, item.listing.listingKey))
    const evidence = await db().select().from(sourceEvidence).where(eq(sourceEvidence.runId, runId))
    const observations = await db()
      .select()
      .from(sourceListingObservations)
      .where(eq(sourceListingObservations.listingId, listing[0]!.id))

    expect(evidence).toHaveLength(1)
    expect(observations).toHaveLength(1)
  })

  it('allows only one queued or running collection per source', async () => {
    const [activeRun] = await db()
      .insert(collectionRuns)
      .values({ sourceId: sourceId!, status: 'queued' })
      .returning({ id: collectionRuns.id })

    await expect(
      db().insert(collectionRuns).values({ sourceId: sourceId!, status: 'running' }),
    ).rejects.toMatchObject({ cause: expect.objectContaining({ code: '23505' }) })

    await db()
      .update(collectionRuns)
      .set({ status: 'failed', completedAt: new Date() })
      .where(eq(collectionRuns.id, activeRun.id))

    await expect(
      db().insert(collectionRuns).values({ sourceId: sourceId!, status: 'running' }),
    ).resolves.toBeDefined()
  })
})
