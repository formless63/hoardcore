import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import type { NormalizedCatalogRecord } from '~/modules/types'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { catalogProducts, catalogSources, catalogVariants, collectionRuns, sourceListings, user } from '~/server/db/schema'
import { persistCatalogSnapshot } from '~/server/db/catalog-persistence.server'
import { createResearchBatchExport } from './research.batch'
import {
  authorizeResearchApiToken,
  createResearchApiToken,
  importResearchResult,
  listResearchComparables,
  listResearchHistory,
  revokeResearchApiToken,
  saveResearchBatch,
} from './research.server'
import { researchBatches, researchSubmissions } from '~/server/db/schema/research'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip

describeWithDatabase('research persistence and agent authorization', () => {
  const suffix = crypto.randomUUID()
  const firstUserId = `research-owner-${suffix}`
  const secondUserId = `research-other-${suffix}`
  let sourceId = ''
  let listingId = ''
  let productId = ''
  let variantId = ''
  const db = () => getDatabase()

  beforeAll(async () => {
    const now = new Date()
    await db().insert(user).values([
      { id: firstUserId, name: 'Research owner', email: `${firstUserId}@example.test`, emailVerified: false, createdAt: now, updatedAt: now },
      { id: secondUserId, name: 'Research other', email: `${secondUserId}@example.test`, emailVerified: false, createdAt: now, updatedAt: now },
    ])
    const [source] = await db().insert(catalogSources).values({ moduleId: 'test', displayName: 'Research fixture', sourceKey: `research-${suffix}` }).returning({ id: catalogSources.id })
    sourceId = source!.id
    const [run] = await db().insert(collectionRuns).values({ sourceId, status: 'succeeded' }).returning({ id: collectionRuns.id })
    const record: NormalizedCatalogRecord = {
      product: { productKey: `research-product-${suffix}`, title: 'Research fixture product', tags: [] },
      variant: { variantKey: `research-variant-${suffix}`, productKey: `research-product-${suffix}`, title: 'Default', price: 12, currency: 'USD', available: true },
      listing: { listingKey: `research-listing-${suffix}`, sourceKey: `research-${suffix}`, productKey: `research-product-${suffix}`, variantKey: `research-variant-${suffix}`, url: 'https://example.test/research-fixture', current: { title: 'Research fixture product', price: 12, currency: 'USD', available: true }, observedAt: '2026-09-16T00:00:00Z' },
    }
    const persisted = await persistCatalogSnapshot(db(), sourceId, [record], { runId: run!.id, observedAt: new Date('2026-09-16T00:00:00Z') })
    listingId = persisted[0]!.listingId
    const [listing] = await db().select({ productId: sourceListings.productId, variantId: sourceListings.variantId }).from(sourceListings).where(eq(sourceListings.id, listingId))
    productId = listing!.productId
    variantId = listing!.variantId
  })

  afterAll(async () => {
    // Comparables point at catalog rows, so clear this fixture's append-only
    // batch first; its dependent submissions/comparables cascade.
    await db().delete(researchBatches).where(eq(researchBatches.createdByUserId, firstUserId))
    if (sourceId) await db().delete(catalogSources).where(eq(catalogSources.id, sourceId))
    await db().delete(catalogProducts).where(eq(catalogProducts.id, productId))
    await db().delete(user).where(inArray(user.id, [firstUserId, secondUserId]))
    await closeDatabase()
  })

  it('retains immutable raw research, projects comparables, scopes reads, and revokes agent tokens', async () => {
    const exported = createResearchBatchExport([{
      product: { productKey: productId, title: 'Research fixture product', tags: [] },
      variant: { variantKey: variantId, productKey: productId, title: 'Default', price: 12, currency: 'USD', available: true },
      listing: { listingKey: listingId, sourceKey: `research-${suffix}`, productKey: productId, variantKey: variantId, url: 'https://example.test/research-fixture', current: { title: 'Research fixture product', price: 12, currency: 'USD', available: true }, observedAt: '2026-09-16T00:00:00Z' },
    }], { createdAt: '2026-09-16T01:00:00Z' })
    await saveResearchBatch(db(), firstUserId, exported.packet, exported.prompt)
    const raw = JSON.stringify({
      resultVersion: '1.0', packetVersion: exported.packet.packetVersion, promptVersion: exported.packet.promptVersion, schemaVersion: exported.packet.schemaVersion,
      packetId: exported.packet.packetId, resultId: `manual-${suffix}`, completedAt: '2026-09-16T02:00:00Z',
      records: [{ reference: exported.packet.records[0]!.reference, status: 'valid', claims: [], marketEstimates: [], risks: [], citations: [{ citationId: 'c1', url: 'https://market.example/item' }], diagnostics: [], comparables: [{ comparableId: 'sold-1', channel: 'marketplace', evidenceType: 'completed_sale', price: 45, shipping: 5, currency: 'USD', condition: 'used', soldAt: '2026-09-15T00:00:00Z', url: 'https://market.example/item', citationId: 'c1', notes: 'manual fixture' }] }],
    })
    const imported = await importResearchResult(db(), firstUserId, raw)
    expect(imported).toMatchObject({ status: 'valid', comparableCount: 1 })
    await expect(importResearchResult(db(), secondUserId, raw)).rejects.toThrow('not available to this user')
    expect(await importResearchResult(db(), firstUserId, raw)).toMatchObject({ idempotent: true })
    await expect(importResearchResult(db(), firstUserId, raw.replace('manual fixture', 'changed payload'))).rejects.toThrow('immutable submission')

    const noteRaw = JSON.stringify({
      resultVersion: '1.0', packetVersion: exported.packet.packetVersion, promptVersion: exported.packet.promptVersion, schemaVersion: exported.packet.schemaVersion,
      packetId: exported.packet.packetId, resultId: `note-${suffix}`, completedAt: '2026-09-16T03:00:00Z',
      records: [{ reference: exported.packet.records[0]!.reference, status: 'valid', claims: [{ field: 'notes', value: 'Freeform inspection note without a price', citationIds: [] }], marketEstimates: [], risks: [], citations: [], diagnostics: [] }],
    })
    expect(await importResearchResult(db(), firstUserId, noteRaw)).toMatchObject({ status: 'valid', comparableCount: 0 })

    const rows = await listResearchComparables(db(), firstUserId, listingId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ channel: 'marketplace', evidenceType: 'completed_sale', price: '45.00', shipping: '5.00', notes: 'manual fixture' })
    expect(await listResearchComparables(db(), secondUserId, listingId)).toEqual([])
    const history = await listResearchHistory(db(), firstUserId, listingId)
    expect(history).toHaveLength(2)
    expect(history.map((item) => item.rawPayload)).toEqual(expect.arrayContaining([raw, noteRaw]))
    expect((await db().select().from(researchSubmissions).where(eq(researchSubmissions.id, imported.id))).length).toBe(1)

    await expect(saveResearchBatch(db(), firstUserId, { ...exported.packet, createdAt: '2026-09-16T03:00:00Z' }, exported.prompt)).rejects.toThrow('immutable packet')
    const credential = await createResearchApiToken(db(), firstUserId, 'integration agent')
    expect(await authorizeResearchApiToken(db(), credential.token, 'research:write')).toMatchObject({ userId: firstUserId })
    expect(await authorizeResearchApiToken(db(), credential.token, 'research:read')).toBeNull()
    expect(await revokeResearchApiToken(db(), firstUserId, credential.id)).toEqual({ revoked: true })
    expect(await authorizeResearchApiToken(db(), credential.token, 'research:write')).toBeNull()
  })
})
