import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { catalogProducts, catalogSources, catalogVariants, collectionRuns, notificationDeliveries, notificationSettings, savedListingViews, sourceEvidence, sourceListingCurrent, sourceListingObservations, sourceListings, user, watchedListings } from '~/server/db/schema'
import { emptyListingFilters } from '~/features/catalog/listing-filters'
import { deliverQueuedNtfyNotifications, queueAlertsForCollectionRun, readNotificationSettingsFromDatabase, saveSavedViewAlertPreference, saveWatchedListingAlertPreference } from './alerts.server'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip

describeWithDatabase('alert persistence and delivery', () => {
  const suffix = crypto.randomUUID()
  const firstUserId = `alerts-a-${suffix}`
  const secondUserId = `alerts-b-${suffix}`
  let sourceId = ''
  let productId = ''
  let otherProductId = ''
  let listingId = ''
  let savedViewId = ''
  let priceViewId = ''
  const db = () => getDatabase()

  async function addRunObservation(input: { price: string; available: boolean; observedAt: Date }) {
    const [run] = await db().insert(collectionRuns).values({ sourceId, status: 'succeeded', requestLimit: 3, completedAt: input.observedAt }).returning({ id: collectionRuns.id })
    const [evidence] = await db().insert(sourceEvidence).values({ sourceId, runId: run.id, capturedAt: input.observedAt, payload: { test: true } }).returning({ id: sourceEvidence.id })
    const [observation] = await db().insert(sourceListingObservations).values({ listingId, observedAt: input.observedAt, title: 'Alert test item', price: input.price, currency: 'USD', available: input.available, evidenceId: evidence.id }).returning({ id: sourceListingObservations.id })
    await db().insert(sourceListingCurrent).values({ listingId, observedAt: input.observedAt, title: 'Alert test item', price: input.price, currency: 'USD', available: input.available }).onConflictDoUpdate({ target: sourceListingCurrent.listingId, set: { observedAt: input.observedAt, title: 'Alert test item', price: input.price, currency: 'USD', available: input.available } })
    return { runId: run.id, observationId: observation.id }
  }

  beforeAll(async () => {
    const now = new Date(Date.now() - 120_000)
    await db().insert(user).values([
      { id: firstUserId, name: 'Alert A', email: `${firstUserId}@example.test`, emailVerified: false, createdAt: now, updatedAt: now },
      { id: secondUserId, name: 'Alert B', email: `${secondUserId}@example.test`, emailVerified: false, createdAt: now, updatedAt: now },
    ])
    const [source] = await db().insert(catalogSources).values({ moduleId: 'test', displayName: 'Alert fixture source', sourceKey: `alerts-${suffix}`, config: {} }).returning({ id: catalogSources.id })
    sourceId = source.id
    const [product] = await db().insert(catalogProducts).values({ productKey: `alerts-product-${suffix}`, title: 'Alert test item', tags: [] }).returning({ id: catalogProducts.id })
    productId = product.id
    const [variant] = await db().insert(catalogVariants).values({ productId: product.id, variantKey: `alerts-variant-${suffix}`, title: 'Default Title' }).returning({ id: catalogVariants.id })
    const [listing] = await db().insert(sourceListings).values({ sourceId, productId: product.id, variantId: variant.id, listingKey: `alerts-listing-${suffix}`, url: 'https://catalog.example.test/alert-item' }).returning({ id: sourceListings.id })
    listingId = listing.id
    await addRunObservation({ price: '100.00', available: true, observedAt: now })
    await db().insert(watchedListings).values({ userId: firstUserId, listingId, alertsEnabled: true, eventTypes: ['price_change', 'availability_change'] })
    const [view] = await db().insert(savedListingViews).values({ userId: secondUserId, name: `Alert view ${suffix}`, filters: emptyListingFilters }).returning({ id: savedListingViews.id })
    savedViewId = view.id
    await saveSavedViewAlertPreference(db(), secondUserId, savedViewId, true, ['availability_change'])
    const [priceView] = await db().insert(savedListingViews).values({ userId: secondUserId, name: `Price entry ${suffix}`, filters: { ...emptyListingFilters, maxPrice: 90 } }).returning({ id: savedListingViews.id })
    priceViewId = priceView.id
    await saveSavedViewAlertPreference(db(), secondUserId, priceViewId, true, ['new_match'])
    await db().insert(notificationSettings).values({ userId: firstUserId, enabled: true, endpoint: 'https://ntfy.example.test', topic: 'first-user-topic' })
  })

  afterAll(async () => {
    if (sourceId) await db().delete(catalogSources).where(eq(catalogSources.id, sourceId))
    const productIds = [productId, otherProductId].filter(Boolean)
    if (productIds.length) await db().delete(catalogProducts).where(inArray(catalogProducts.id, productIds))
    await db().delete(user).where(inArray(user.id, [firstUserId, secondUserId]))
    await closeDatabase()
  })

  it('keeps notification settings disabled by default and scopes item/view preferences to their owners', async () => {
    await expect(readNotificationSettingsFromDatabase(db(), secondUserId)).resolves.toMatchObject({ enabled: false, topic: null })
    await expect(saveWatchedListingAlertPreference(db(), secondUserId, listingId, true, ['price_change'])).rejects.toThrow('Watched listing not found')
    await expect(saveSavedViewAlertPreference(db(), firstUserId, savedViewId, true, ['new_match'])).rejects.toThrow('Saved view not found')
  })

  it('classifies changes, honors per-user opt-in, and deduplicates a repeated evaluation', async () => {
    const changeAt = new Date(Date.now() + 1_000)
    await db().insert(notificationSettings).values({ userId: secondUserId, enabled: true, endpoint: 'https://ntfy.example.test', topic: 'second-user-topic' })
    const change = await addRunObservation({ price: '80.00', available: true, observedAt: changeAt })
    expect(await queueAlertsForCollectionRun(db(), { runId: change.runId, listingIds: [listingId] })).toEqual({ events: 2, queued: 2 })
    expect(await queueAlertsForCollectionRun(db(), { runId: change.runId, listingIds: [listingId] })).toEqual({ events: 2, queued: 0 })
    const rows = await db().select().from(notificationDeliveries).where(and(eq(notificationDeliveries.listingId, listingId), eq(notificationDeliveries.eventType, 'price_change')))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe(firstUserId)
    const entryRows = await db().select().from(notificationDeliveries).where(and(eq(notificationDeliveries.listingId, listingId), eq(notificationDeliveries.eventType, 'new_match')))
    expect(entryRows).toHaveLength(1)
    expect(entryRows[0]).toMatchObject({ userId: secondUserId, savedViewId: priceViewId })

    const availability = await addRunObservation({ price: '80.00', available: false, observedAt: new Date(changeAt.getTime() + 1_000) })
    expect(await queueAlertsForCollectionRun(db(), { runId: availability.runId, listingIds: [listingId] })).toEqual({ events: 2, queued: 2 })
    const availabilityRows = await db().select().from(notificationDeliveries).where(and(eq(notificationDeliveries.listingId, listingId), eq(notificationDeliveries.eventType, 'availability_change')))
    expect(availabilityRows.map((row) => row.userId).sort()).toEqual([firstUserId, secondUserId].sort())
  })

  it('evaluates only listings explicitly persisted for the requested run payload', async () => {
    const otherProductKey = `alerts-other-product-${suffix}`
    const [otherProduct] = await db().insert(catalogProducts).values({ productKey: otherProductKey, title: 'Other alert item', tags: [] }).returning({ id: catalogProducts.id })
    otherProductId = otherProduct.id
    const [otherVariant] = await db().insert(catalogVariants).values({ productId: otherProduct.id, variantKey: `alerts-other-variant-${suffix}`, title: 'Default Title' }).returning({ id: catalogVariants.id })
    const [otherListing] = await db().insert(sourceListings).values({ sourceId, productId: otherProduct.id, variantId: otherVariant.id, listingKey: `alerts-other-listing-${suffix}`, url: 'https://catalog.example.test/other-alert-item' }).returning({ id: sourceListings.id })
    const observedAt = new Date(Date.now() + 10_000)
    const [run] = await db().insert(collectionRuns).values({ sourceId, status: 'succeeded', requestLimit: 3, completedAt: observedAt }).returning({ id: collectionRuns.id })
    const [evidence] = await db().insert(sourceEvidence).values({ sourceId, runId: run.id, capturedAt: observedAt, payload: { test: true } }).returning({ id: sourceEvidence.id })
    await db().insert(sourceListingObservations).values([
      { listingId, observedAt, title: 'Alert test item', price: '70.00', currency: 'USD', available: true, evidenceId: evidence.id },
      { listingId: otherListing.id, observedAt, title: 'Other alert item', price: '50.00', currency: 'USD', available: true, evidenceId: evidence.id },
    ])
    await db().insert(sourceListingCurrent).values([
      { listingId, observedAt, title: 'Alert test item', price: '70.00', currency: 'USD', available: true },
      { listingId: otherListing.id, observedAt, title: 'Other alert item', price: '50.00', currency: 'USD', available: true },
    ]).onConflictDoUpdate({ target: sourceListingCurrent.listingId, set: { observedAt, title: sql`excluded.title`, price: sql`excluded.price`, currency: sql`excluded.currency`, available: sql`excluded.available` } })

    const result = await queueAlertsForCollectionRun(db(), { runId: run.id, listingIds: [listingId] })

    expect(result.events).toBeGreaterThan(0)
    const otherDeliveries = await db().select({ id: notificationDeliveries.id }).from(notificationDeliveries).where(eq(notificationDeliveries.listingId, otherListing.id))
    expect(otherDeliveries).toHaveLength(0)
  })

  it('uses a mock ntfy transport and retries a failed send without external network access', async () => {
    let calls = 0
    const failed = await deliverQueuedNtfyNotifications(db(), async () => { calls += 1; return { ok: false, status: 503, text: async () => '' } })
    expect(calls).toBeGreaterThan(0)
    expect(failed.sent).toBe(0)
    expect(failed.nextRetryAt).toBeInstanceOf(Date)
    expect(failed.nextDeliveryAt).toEqual(failed.nextRetryAt)
    const [retry] = await db().select().from(notificationDeliveries).where(eq(notificationDeliveries.status, 'queued')).limit(1)
    expect(retry?.attemptCount).toBe(1)
    await db().update(notificationDeliveries).set({ nextAttemptAt: new Date(0) }).where(eq(notificationDeliveries.status, 'queued'))
    const succeeded = await deliverQueuedNtfyNotifications(db(), async (url, init) => { expect(url).toMatch(/^https:\/\/ntfy\.example\.test\//); expect(init.redirect).toBe('manual'); return { ok: true, status: 200, text: async () => '' } })
    expect(succeeded.sent).toBeGreaterThan(0)
  })

  it('schedules an immediate continuation when more than 20 deliveries are ready', async () => {
    const prefix = `alerts-batch-${suffix}`
    await db().insert(notificationDeliveries).values(Array.from({ length: 21 }, (_, index) => ({
      userId: firstUserId, listingId, kind: 'watch', eventType: 'price_change' as const, dedupeKey: `${prefix}-${index}`,
      payload: { title: 'Batch alert', body: 'Queued delivery' }, status: 'queued' as const,
    })))

    const firstBatch = await deliverQueuedNtfyNotifications(db(), async () => ({ ok: true, status: 200, text: async () => '' }))
    expect(firstBatch).toMatchObject({ attempted: 20, sent: 20 })
    expect(firstBatch.nextDeliveryAt).toBeInstanceOf(Date)
    const remaining = await db().select({ id: notificationDeliveries.id }).from(notificationDeliveries)
      .where(and(like(notificationDeliveries.dedupeKey, `${prefix}%`), eq(notificationDeliveries.status, 'queued')))
    expect(remaining).toHaveLength(1)

    const secondBatch = await deliverQueuedNtfyNotifications(db(), async () => ({ ok: true, status: 200, text: async () => '' }))
    expect(secondBatch).toMatchObject({ attempted: 1, sent: 1, nextDeliveryAt: undefined })
  })
})
