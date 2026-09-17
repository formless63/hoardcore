import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { normalizeShopifyCatalogUrl } from '~/modules/shopify/source-config'
import { closeDatabase, getDatabase } from '../db/index.server'
import { catalogSources, collectionRunEvents, collectionRuns, sourceEvidence, sourceListingCurrent, sourceListingObservations, sourceListings } from '../db/schema'
import { runCatalogCollection } from './tasks'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl

describe.skipIf(!testDatabaseUrl)('catalog collection worker safety', () => {
  let sourceId: string | undefined

  afterEach(async () => {
    if (sourceId) await getDatabase().delete(catalogSources).where(eq(catalogSources.id, sourceId))
    sourceId = undefined
  })

  afterAll(async () => { await closeDatabase() })

  it('persists opt-in card counts and timestamped HTML evidence without guessing other variants', async () => {
    const normalized = normalizeShopifyCatalogUrl(`https://fixture-${crypto.randomUUID()}.invalid/collections/sale`)
    const [source] = await getDatabase().insert(catalogSources).values({
      moduleId: 'shopify', displayName: 'Stock fixture', sourceKey: normalized.sourceKey,
      config: { ...normalized.config, stockCardsEnabled: true },
    }).returning({ id: catalogSources.id })
    sourceId = source.id
    const [run] = await getDatabase().insert(collectionRuns).values({ sourceId, requestLimit: 2 }).returning({ id: collectionRuns.id })
    const http = vi.fn(async (url: string) => url.includes('products.json')
      ? new Response(JSON.stringify({ products: [{ id: 1, title: 'Fixture', handle: 'fixture', variants: [
        { id: 10, price: '1.00', available: true }, { id: 11, price: '1.00', available: true },
      ] }] }), { headers: { 'content-type': 'application/json' } })
      : new Response('<div class="product-item" id="product-1"><form class="variants"><input name="id" value="10"></form><div class="product-bottom"><div class="product-inventory"><span>7 In stock</span></div></div></div>',
        { headers: { 'content-type': 'text/html' } }))
    await runCatalogCollection({ sourceId, runId: run.id }, { logger: { info: vi.fn() } }, {
      collectionEnabled: true, accessPolicy: async () => true, http,
    })
    const current = await getDatabase().select({ stock: sourceListingCurrent.stockQuantity }).from(sourceListingCurrent)
      .innerJoin(sourceListings, eq(sourceListings.id, sourceListingCurrent.listingId)).where(eq(sourceListings.sourceId, source.id))
    const observations = await getDatabase().select({ stock: sourceListingObservations.stockQuantity }).from(sourceListingObservations)
      .innerJoin(sourceListings, eq(sourceListings.id, sourceListingObservations.listingId)).where(eq(sourceListings.sourceId, source.id))
    const [evidence] = await getDatabase().select().from(sourceEvidence).where(eq(sourceEvidence.runId, run.id))
    const [recorded] = await getDatabase().select().from(collectionRuns).where(eq(collectionRuns.id, run.id))
    expect(current.map((row) => row.stock).sort()).toEqual([7, null].sort())
    expect(observations.map((row) => row.stock).sort()).toEqual([7, null].sort())
    expect((evidence?.payload as { stockPages: { html: string; capturedAt: string }[] }).stockPages[0]).toMatchObject({
      html: expect.stringContaining('7 In stock'), capturedAt: expect.any(String),
    })
    expect(recorded).toMatchObject({ status: 'succeeded', requestCount: '2' })
    expect(http).toHaveBeenCalledTimes(2)
  })

  it('persists a resumed checkpoint as one snapshot without repeating page one', async () => {
    const normalized = normalizeShopifyCatalogUrl(`https://fixture-${crypto.randomUUID()}.invalid/collections/sale`)
    const [source] = await getDatabase().insert(catalogSources).values({
      moduleId: 'shopify', displayName: 'Resumed fixture', sourceKey: normalized.sourceKey, config: normalized.config,
    }).returning({ id: catalogSources.id })
    sourceId = source.id
    const firstPage = { products: Array.from({ length: 250 }, (_, index) => ({
      id: index + 1, title: `Product ${index + 1}`, handle: `product-${index + 1}`,
      variants: [{ id: (index + 1) * 10, price: '10.00', available: true }],
    })) }
    const [run] = await getDatabase().insert(collectionRuns).values({
      sourceId, requestLimit: 3, requestCount: '1', pageCount: 1, productCount: 250,
      nextPage: 2, evidencePages: [firstPage], observedAt: new Date('2026-09-17T00:00:00Z'),
    }).returning({ id: collectionRuns.id })
    const http = vi.fn().mockResolvedValue({ status: 200, headers: {}, json: async () => ({ products: [] }) })
    await runCatalogCollection({ sourceId, runId: run.id }, { logger: { info: vi.fn() } }, {
      collectionEnabled: true, accessPolicy: async () => true, http,
    })
    const [recorded] = await getDatabase().select().from(collectionRuns).where(eq(collectionRuns.id, run.id))
    expect(recorded).toMatchObject({ status: 'succeeded', requestCount: '2', pageCount: 2, productCount: 250 })
    expect(http).toHaveBeenCalledOnce()
    expect(http.mock.calls[0]?.[0]).toContain('page=2')
  })

  it('checkpoints a full page and queues the configured discretionary inter-page wait', async () => {
    const normalized = normalizeShopifyCatalogUrl(`https://fixture-${crypto.randomUUID()}.invalid/collections/sale`)
    const [source] = await getDatabase().insert(catalogSources).values({
      moduleId: 'shopify', displayName: 'Wait fixture', sourceKey: normalized.sourceKey, config: normalized.config,
    }).returning({ id: catalogSources.id })
    sourceId = source.id
    const [run] = await getDatabase().insert(collectionRuns).values({ sourceId, requestLimit: 3, interPageWaitMs: 60_000 }).returning({ id: collectionRuns.id })
    const firstPage = { products: Array.from({ length: 250 }, (_, index) => ({
      id: index + 1, title: `Product ${index + 1}`, handle: `product-${index + 1}`,
      variants: [{ id: (index + 1) * 10, price: '10.00', available: true }],
    })) }
    const http = vi.fn().mockResolvedValue({ status: 200, headers: {}, json: async () => firstPage })
    const addJob = vi.fn().mockResolvedValue({})
    await runCatalogCollection({ sourceId, runId: run.id }, { logger: { info: vi.fn() }, addJob }, {
      collectionEnabled: true, accessPolicy: async () => true, http,
    })
    const [recorded] = await getDatabase().select().from(collectionRuns).where(eq(collectionRuns.id, run.id))
    expect(recorded).toMatchObject({ status: 'queued', nextPage: 2, pageCount: 1, productCount: 250, requestCount: '1' })
    expect(recorded?.evidencePages).toHaveLength(1)
    expect(recorded?.nextAllowedAt?.getTime()).toBeGreaterThan(recorded?.minimumAllowedAt?.getTime() ?? 0)
    expect(addJob).toHaveBeenCalledWith('catalog.collect', { sourceId, runId: run.id }, expect.objectContaining({ runAt: expect.any(Date), maxAttempts: 1 }))
    expect(http).toHaveBeenCalledOnce()
  })

  it('records a source rejection without throwing for Graphile to retry', async () => {
    const normalized = normalizeShopifyCatalogUrl(`https://fixture-${crypto.randomUUID()}.invalid/collections/sale`)
    const [source] = await getDatabase().insert(catalogSources).values({
      moduleId: 'shopify', displayName: 'Offline fixture', sourceKey: normalized.sourceKey, config: normalized.config,
    }).returning({ id: catalogSources.id })
    sourceId = source.id
    const [run] = await getDatabase().insert(collectionRuns).values({ sourceId, requestLimit: 2 }).returning({ id: collectionRuns.id })
    const http = vi.fn().mockResolvedValue({ status: 403, headers: {}, json: async () => ({}) })

    await expect(runCatalogCollection(
      { sourceId, runId: run.id },
      { logger: { info: vi.fn() } },
      { collectionEnabled: true, accessPolicy: async () => true, http },
    )).resolves.toBeUndefined()

    const [recorded] = await getDatabase().select().from(collectionRuns).where(eq(collectionRuns.id, run.id))
    const events = await getDatabase().select().from(collectionRunEvents).where(eq(collectionRunEvents.runId, run.id))
    expect(recorded).toMatchObject({ status: 'failed', requestCount: '1', requestLimit: 2 })
    expect(events.at(-1)?.message).toContain('stopped')
    expect(http).toHaveBeenCalledTimes(1)
  })

  it('rejects a disabled host before any source request', async () => {
    const normalized = normalizeShopifyCatalogUrl(`https://fixture-${crypto.randomUUID()}.invalid/collections/sale`)
    const [source] = await getDatabase().insert(catalogSources).values({
      moduleId: 'shopify', displayName: 'Offline fixture', sourceKey: normalized.sourceKey, config: normalized.config,
    }).returning({ id: catalogSources.id })
    sourceId = source.id
    const [run] = await getDatabase().insert(collectionRuns).values({ sourceId, requestLimit: 2 }).returning({ id: collectionRuns.id })
    const http = vi.fn()

    await expect(runCatalogCollection(
      { sourceId, runId: run.id },
      { logger: { info: vi.fn() } },
      { collectionEnabled: false, http },
    )).rejects.toThrow('Catalog collection is disabled on this deployment')

    expect(http).not.toHaveBeenCalled()
    const [recorded] = await getDatabase().select().from(collectionRuns).where(eq(collectionRuns.id, run.id))
    expect(recorded).toMatchObject({ status: 'failed', requestCount: '0' })
  })

  it('does not fetch a paused source even when a run was queued before it was paused', async () => {
    const normalized = normalizeShopifyCatalogUrl(`https://fixture-${crypto.randomUUID()}.invalid/collections/sale`)
    const [source] = await getDatabase().insert(catalogSources).values({
      moduleId: 'shopify', displayName: 'Paused fixture', sourceKey: normalized.sourceKey, config: normalized.config,
      collectionEnabled: false,
    }).returning({ id: catalogSources.id })
    sourceId = source.id
    const [run] = await getDatabase().insert(collectionRuns).values({ sourceId, requestLimit: 2 }).returning({ id: collectionRuns.id })
    const http = vi.fn()
    await runCatalogCollection({ sourceId, runId: run.id }, { logger: { info: vi.fn() } }, { collectionEnabled: true, http })
    expect(http).not.toHaveBeenCalled()
    const [recorded] = await getDatabase().select().from(collectionRuns).where(eq(collectionRuns.id, run.id))
    expect(recorded).toMatchObject({ status: 'failed', error: 'Collection is paused for this source' })
  })

  it('does not revive a recovered terminal run or contact its source', async () => {
    const normalized = normalizeShopifyCatalogUrl(`https://fixture-${crypto.randomUUID()}.invalid/collections/sale`)
    const [source] = await getDatabase().insert(catalogSources).values({
      moduleId: 'shopify', displayName: 'Recovered fixture', sourceKey: normalized.sourceKey, config: normalized.config,
    }).returning({ id: catalogSources.id })
    sourceId = source.id
    const [run] = await getDatabase().insert(collectionRuns).values({ sourceId, status: 'failed', requestLimit: 2, error: 'Interrupted' }).returning({ id: collectionRuns.id })
    const http = vi.fn()
    await runCatalogCollection(
      { sourceId, runId: run.id },
      { logger: { info: vi.fn() } },
      { collectionEnabled: true, accessPolicy: async () => true, http },
    )
    expect(http).not.toHaveBeenCalled()
    const [recorded] = await getDatabase().select().from(collectionRuns).where(eq(collectionRuns.id, run.id))
    expect(recorded).toMatchObject({ status: 'failed', error: 'Interrupted' })
  })

  it('records invalid persisted Shopify configuration as failed instead of leaving a run active', async () => {
    const [source] = await getDatabase().insert(catalogSources).values({
      moduleId: 'shopify', displayName: 'Invalid config fixture', sourceKey: `invalid-${crypto.randomUUID()}`,
      config: { catalogUrl: 'http://127.0.0.1/' },
    }).returning({ id: catalogSources.id })
    sourceId = source.id
    const [run] = await getDatabase().insert(collectionRuns).values({ sourceId, requestLimit: 2 }).returning({ id: collectionRuns.id })
    const http = vi.fn()

    await expect(runCatalogCollection(
      { sourceId, runId: run.id },
      { logger: { info: vi.fn() } },
      { collectionEnabled: true, http },
    )).resolves.toBeUndefined()

    expect(http).not.toHaveBeenCalled()
    const [recorded] = await getDatabase().select().from(collectionRuns).where(eq(collectionRuns.id, run.id))
    expect(recorded).toMatchObject({ status: 'failed' })
    expect(recorded?.error).toContain('Catalog URL must use HTTPS')
  })

  it('does not send first-page validators from a prior multi-page snapshot', async () => {
    const normalized = normalizeShopifyCatalogUrl(`https://fixture-${crypto.randomUUID()}.invalid/collections/sale`)
    const [source] = await getDatabase().insert(catalogSources).values({
      moduleId: 'shopify', displayName: 'Multi-page fixture', sourceKey: normalized.sourceKey, config: normalized.config,
    }).returning({ id: catalogSources.id })
    sourceId = source.id
    await getDatabase().insert(collectionRuns).values({
      sourceId, status: 'succeeded', requestLimit: 3, pageCount: 2, etag: '"first-page"', completedAt: new Date(),
    })
    const [run] = await getDatabase().insert(collectionRuns).values({ sourceId, requestLimit: 2 }).returning({ id: collectionRuns.id })
    const http = vi.fn().mockResolvedValue({ status: 200, headers: {}, json: async () => ({ products: [] }) })

    await runCatalogCollection(
      { sourceId, runId: run.id },
      { logger: { info: vi.fn() } },
      { collectionEnabled: true, accessPolicy: async () => true, http },
    )

    expect(http).toHaveBeenCalledTimes(1)
    expect(http.mock.calls[0]?.[1].headers).not.toHaveProperty('if-none-match')
  })

  it('durably defers a long source Retry-After instead of holding the worker', async () => {
    const normalized = normalizeShopifyCatalogUrl(`https://fixture-${crypto.randomUUID()}.invalid/collections/sale`)
    const [source] = await getDatabase().insert(catalogSources).values({
      moduleId: 'shopify', displayName: 'Retry-after fixture', sourceKey: normalized.sourceKey, config: normalized.config,
    }).returning({ id: catalogSources.id })
    sourceId = source.id
    const [run] = await getDatabase().insert(collectionRuns).values({ sourceId, requestLimit: 2 }).returning({ id: collectionRuns.id })
    const addJob = vi.fn().mockResolvedValue({})
    const http = vi.fn().mockResolvedValue({ status: 429, headers: { 'retry-after': '86400' }, json: async () => ({}) })

    await runCatalogCollection(
      { sourceId, runId: run.id },
      { logger: { info: vi.fn() }, addJob },
      { collectionEnabled: true, accessPolicy: async () => true, http },
    )

    expect(http).toHaveBeenCalledTimes(1)
    expect(addJob).toHaveBeenCalledWith('catalog.collect', { sourceId, runId: run.id }, expect.objectContaining({
      runAt: expect.any(Date), maxAttempts: 1,
    }))
    const [recorded] = await getDatabase().select().from(collectionRuns).where(eq(collectionRuns.id, run.id))
    expect(recorded).toMatchObject({ status: 'queued', requestCount: '1' })
    expect(recorded?.error).toContain('Deferred until')
  })
})
