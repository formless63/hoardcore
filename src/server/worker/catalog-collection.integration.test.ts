import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { normalizeShopifyCatalogUrl } from '~/modules/shopify/source-config'
import { closeDatabase, getDatabase } from '../db/index.server'
import { catalogSources, collectionRunEvents, collectionRuns } from '../db/schema'
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
