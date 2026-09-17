import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { Database } from '~/server/db/db.server'
import { notificationDeliveries, notificationSettings, savedViewNotificationRules, type AlertEventType } from '~/server/db/schema/alerts'
import { sourceCategoryGroupOverrides, sourceEvidence, sourceListingCurrent, sourceListingObservations } from '~/server/db/schema/catalog'
import { catalogProducts, catalogVariants, sourceListings } from '~/server/db/schema/catalog'
import { catalogSources } from '~/server/db/schema/catalog-sources'
import { savedListingViews } from '~/server/db/schema/saved-listing-views'
import type { CurrentListing } from '~/features/catalog/catalog.schemas'
import { listingFiltersSchema, matchesListingFilters, type ListingFilters } from '~/features/catalog/listing-filters'
import { resolvedCategoryGroup } from '~/features/catalog/category-overrides.server'
import { watchedListings } from '~/server/db/schema/watched-listings'
import { ntfyEndpointSchema, type NotificationSettingsInput } from './alerts.schemas'
import { secureNtfyFetch, type NtfyFetch } from './ntfy-transport.server'

export type AlertEvent = {
  listing: CurrentListing
  observationId: string
  eventType: AlertEventType
  /** Present for later observations so saved views can detect entry transitions. */
  previousListing?: CurrentListing
  /** Watches define “new” as the first recorded observation, unlike saved views. */
  firstObservation?: boolean
}

type AlertSubscriptions = {
  watchesByListing: Map<string, Array<typeof watchedListings.$inferSelect>>
  viewRules: Array<{
    rule: typeof savedViewNotificationRules.$inferSelect
    view: typeof savedListingViews.$inferSelect
    filters: ListingFilters
  }>
  enabledUserIds: Set<string>
}

const alertQueryBatchSize = 500

function chunks<T>(items: readonly T[], size = alertQueryBatchSize): T[][] {
  const output: T[][] = []
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size))
  return output
}

export async function readNotificationSettingsFromDatabase(db: Database, userId: string) {
  const [row] = await db.select({ enabled: notificationSettings.enabled, endpoint: notificationSettings.endpoint, topic: notificationSettings.topic }).from(notificationSettings).where(eq(notificationSettings.userId, userId))
  return row ?? { enabled: false, endpoint: 'https://ntfy.sh', topic: null }
}

export async function saveNotificationSettingsToDatabase(db: Database, userId: string, input: NotificationSettingsInput) {
  const topic = input.topic || null
  await db.insert(notificationSettings).values({ userId, enabled: input.enabled, endpoint: input.endpoint, topic }).onConflictDoUpdate({ target: notificationSettings.userId, set: { enabled: input.enabled, endpoint: input.endpoint, topic, updatedAt: new Date() } })
  return { enabled: input.enabled, endpoint: input.endpoint, topic }
}

export async function saveWatchedListingAlertPreference(db: Database, userId: string, listingId: string, enabled: boolean, eventTypes: AlertEventType[]) {
  const rows = await db.update(watchedListings).set({ alertsEnabled: enabled, eventTypes }).where(and(eq(watchedListings.userId, userId), eq(watchedListings.listingId, listingId))).returning({ id: watchedListings.id })
  if (!rows.length) throw new Error('Watched listing not found')
  return { enabled, eventTypes }
}

export async function saveSavedViewAlertPreference(db: Database, userId: string, savedViewId: string, enabled: boolean, eventTypes: AlertEventType[]) {
  const [view] = await db.select({ id: savedListingViews.id }).from(savedListingViews).where(and(eq(savedListingViews.id, savedViewId), eq(savedListingViews.userId, userId)))
  if (!view) throw new Error('Saved view not found')
  await db.insert(savedViewNotificationRules).values({ userId, savedViewId, enabled, eventTypes }).onConflictDoUpdate({ target: savedViewNotificationRules.savedViewId, set: { userId, enabled, eventTypes, updatedAt: new Date() } })
  return { enabled, eventTypes }
}

export async function listAlertSubscriptionsFromDatabase(db: Database, userId: string) {
  const watches = await db.select({ listingId: watchedListings.listingId, title: catalogProducts.title, enabled: watchedListings.alertsEnabled, eventTypes: watchedListings.eventTypes })
    .from(watchedListings).innerJoin(sourceListings, eq(sourceListings.id, watchedListings.listingId)).innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
    .where(eq(watchedListings.userId, userId)).orderBy(asc(catalogProducts.title))
  const views = await db.select({ savedViewId: savedListingViews.id, name: savedListingViews.name, enabled: savedViewNotificationRules.enabled, eventTypes: savedViewNotificationRules.eventTypes })
    .from(savedListingViews).leftJoin(savedViewNotificationRules, eq(savedViewNotificationRules.savedViewId, savedListingViews.id))
    .where(eq(savedListingViews.userId, userId)).orderBy(asc(savedListingViews.name))
  return {
    watches,
    views: views.map((view) => ({ ...view, enabled: view.enabled ?? false, eventTypes: view.eventTypes ?? ['new_match', 'price_change', 'availability_change'] })),
  }
}

function alertPayload(event: AlertEvent, reason: string) {
  const price = event.listing.price === null ? 'Price unavailable' : `${event.listing.currency ? `${event.listing.currency} ` : ''}${event.listing.price}`
  return { title: event.listing.productTitle, body: `${reason}: ${price} · ${event.listing.available ? 'in stock' : 'out of stock'} · ${event.listing.sourceName}`, tags: event.listing.available ? ['shopping_cart'] : ['warning'] }
}

async function loadAlertSubscriptions(db: Database, listingIds: readonly string[]): Promise<AlertSubscriptions> {
  const watches = listingIds.length
    ? await db.select().from(watchedListings).where(and(inArray(watchedListings.listingId, [...listingIds]), eq(watchedListings.alertsEnabled, true)))
    : []
  const rawViewRules = await db.select({ rule: savedViewNotificationRules, view: savedListingViews })
    .from(savedViewNotificationRules)
    .innerJoin(savedListingViews, eq(savedListingViews.id, savedViewNotificationRules.savedViewId))
    .where(eq(savedViewNotificationRules.enabled, true))
  const viewRules = rawViewRules.map(({ rule, view }) => ({ rule, view, filters: listingFiltersSchema.parse(view.filters) }))
  const userIds = [...new Set([...watches.map((watch) => watch.userId), ...viewRules.map(({ rule }) => rule.userId)])]
  const settings = userIds.length
    ? await db.select({ userId: notificationSettings.userId, topic: notificationSettings.topic })
      .from(notificationSettings)
      .where(and(inArray(notificationSettings.userId, userIds), eq(notificationSettings.enabled, true)))
    : []
  const watchesByListing = new Map<string, Array<typeof watchedListings.$inferSelect>>()
  for (const watch of watches) watchesByListing.set(watch.listingId, [...(watchesByListing.get(watch.listingId) ?? []), watch])
  return { watchesByListing, viewRules, enabledUserIds: new Set(settings.filter((setting) => setting.topic).map((setting) => setting.userId)) }
}

/** Store a delivery intent once per user, rule/item, listing, observation, and event. */
export async function queueAlertForEvent(db: Database, event: AlertEvent, subscriptions?: AlertSubscriptions) {
  const loaded = subscriptions ?? await loadAlertSubscriptions(db, [event.listing.id])
  const watches = loaded.watchesByListing.get(event.listing.id) ?? []
  const candidates = [
    ...watches.filter((watch) => watch.createdAt <= event.listing.observedAt && watch.eventTypes.includes(event.eventType) && (event.eventType !== 'new_match' || event.firstObservation)).map((watch) => ({ userId: watch.userId, kind: 'watch' as const, ruleId: watch.id, savedViewId: null, reason: 'Watched listing changed' })),
    ...loaded.viewRules.filter(({ rule, filters }) => {
      if (rule.createdAt > event.listing.observedAt || !rule.eventTypes.includes(event.eventType)) return false
      if (!matchesListingFilters(event.listing, filters)) return false
      return event.eventType !== 'new_match' || event.previousListing === undefined || !matchesListingFilters(event.previousListing, filters)
    }).map(({ rule, view }) => ({ userId: rule.userId, kind: 'saved_view' as const, ruleId: rule.id, savedViewId: view.id, reason: `Matched saved view “${view.name}”` })),
  ]
  if (!candidates.length) return { queued: 0 }
  let queued = 0
  for (const candidate of candidates) {
    if (!loaded.enabledUserIds.has(candidate.userId)) continue
    const [row] = await db.insert(notificationDeliveries).values({ userId: candidate.userId, listingId: event.listing.id, observationId: event.observationId, savedViewId: candidate.savedViewId, kind: candidate.kind, eventType: event.eventType, dedupeKey: `${candidate.kind}:${candidate.ruleId}:${event.listing.id}:${event.observationId}:${event.eventType}`, payload: alertPayload(event, candidate.reason) }).onConflictDoNothing({ target: [notificationDeliveries.userId, notificationDeliveries.dedupeKey] }).returning({ id: notificationDeliveries.id })
    if (row) queued += 1
  }
  return { queued }
}

async function listCurrentListingsForAlertEvaluation(db: Database, listingIds: readonly string[]): Promise<CurrentListing[]> {
  const listings: CurrentListing[] = []
  for (const ids of chunks(listingIds)) {
    const rows = await db.select({
      id: sourceListings.id, url: sourceListings.url, sourceId: catalogSources.id, sourceName: catalogSources.displayName, moduleId: catalogSources.moduleId,
      productId: catalogProducts.id, productTitle: catalogProducts.title, manufacturer: catalogProducts.brand, category: catalogProducts.productType,
      categoryGroupOverride: sourceCategoryGroupOverrides.categoryGroup, tags: catalogProducts.tags,
      variantId: catalogVariants.id, variantTitle: catalogVariants.title, sku: catalogVariants.sku, imageUrl: sourceListings.imageUrl,
      title: sourceListingCurrent.title, price: sourceListingCurrent.price, compareAtPrice: sourceListingCurrent.compareAtPrice,
      currency: sourceListingCurrent.currency, available: sourceListingCurrent.available, presence: sourceListingCurrent.presence, stockQuantity: sourceListingCurrent.stockQuantity,
      observedAt: sourceListingCurrent.observedAt,
    }).from(sourceListingCurrent)
      .innerJoin(sourceListings, eq(sourceListings.id, sourceListingCurrent.listingId))
      .innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
      .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
      .innerJoin(catalogVariants, eq(catalogVariants.id, sourceListings.variantId))
      .leftJoin(sourceCategoryGroupOverrides, and(
        eq(sourceCategoryGroupOverrides.sourceId, sourceListings.sourceId),
        eq(sourceCategoryGroupOverrides.sourceCategory, catalogProducts.productType),
      ))
      .where(inArray(sourceListingCurrent.listingId, ids))
    listings.push(...rows.map(({ categoryGroupOverride, ...row }) => ({ ...row, categoryGroup: resolvedCategoryGroup(row.category, categoryGroupOverride), mediaCaptureId: null })))
  }
  return listings
}

type PreviousObservation = {
  observationId: string
  title: string | null
  price: string | null
  compareAtPrice: string | null
  currency: string | null
  available: boolean | null
  stockQuantity: number | null
  observedAt: Date | null
}

/** Fetch one immediately preceding observation per target observation, not each listing's full history. */
async function previousObservationsFor(db: Database, observationIds: readonly string[]): Promise<Map<string, PreviousObservation>> {
  const previous = new Map<string, PreviousObservation>()
  for (const ids of chunks(observationIds)) {
    const result = await db.execute<PreviousObservation>(sql`
      select target.id::text as "observationId",
        prior.title, prior.price, prior.compare_at_price as "compareAtPrice", prior.currency,
        prior.available, prior.stock_quantity as "stockQuantity", prior.observed_at as "observedAt"
      from source_listing_observations target
      left join lateral (
        select title, price, compare_at_price, currency, available, stock_quantity, observed_at
        from source_listing_observations
        where listing_id = target.listing_id
          and observed_at < target.observed_at
        order by observed_at desc
        limit 1
      ) prior on true
      where target.id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
    `)
    for (const row of result.rows) previous.set(row.observationId, row)
  }
  return previous
}

/** Only inspect observations from this run, so delayed workers never replay old history. */
export async function queueAlertsForCollectionRun(db: Database, input: { runId: string; listingIds: string[] }) {
  if (!input.listingIds.length) return { events: 0, queued: 0 }
  const rows: Array<{ observation: typeof sourceListingObservations.$inferSelect }> = []
  for (const listingIds of chunks(input.listingIds)) {
    rows.push(...await db.select({ observation: sourceListingObservations })
      .from(sourceListingObservations)
      .innerJoin(sourceEvidence, eq(sourceEvidence.id, sourceListingObservations.evidenceId))
      .where(and(eq(sourceEvidence.runId, input.runId), inArray(sourceListingObservations.listingId, listingIds))))
  }
  if (!rows.length) return { events: 0, queued: 0 }
  const current = new Map((await listCurrentListingsForAlertEvaluation(db, rows.map(({ observation }) => observation.listingId))).map((listing) => [listing.id, listing]))
  const previous = await previousObservationsFor(db, rows.map(({ observation }) => observation.id))
  const subscriptions = await loadAlertSubscriptions(db, [...current.keys()])
  let events = 0; let queued = 0
  for (const { observation } of rows) {
    const listing = current.get(observation.listingId)
    if (!listing || listing.observedAt.getTime() !== observation.observedAt.getTime()) continue
    const prior = previous.get(observation.id)
    const previousListing = prior?.observedAt === null || prior?.observedAt === undefined ? undefined : {
      ...listing, title: prior.title ?? listing.title, price: prior.price, compareAtPrice: prior.compareAtPrice,
      currency: prior.currency, available: prior.available ?? listing.available, stockQuantity: prior.stockQuantity, observedAt: prior.observedAt,
    }
    const types: AlertEventType[] = previousListing === undefined ? ['new_match'] : [...(previousListing.price !== observation.price ? ['price_change' as const] : []), ...(previousListing.available !== observation.available ? ['availability_change' as const] : []), 'new_match']
    for (const eventType of types) { events += 1; queued += (await queueAlertForEvent(db, { listing, observationId: observation.id, eventType, previousListing, firstObservation: previousListing === undefined }, subscriptions)).queued }
  }
  return { events, queued }
}

/** Bounded retries use durable backoff; they never trigger another source collection. */
export async function deliverQueuedNtfyNotifications(db: Database, fetcher: NtfyFetch = secureNtfyFetch, limit = 20) {
  const now = new Date()
  const rows = await db.select({ delivery: notificationDeliveries, settings: notificationSettings }).from(notificationDeliveries).innerJoin(notificationSettings, eq(notificationSettings.userId, notificationDeliveries.userId)).where(and(eq(notificationDeliveries.status, 'queued'), eq(notificationSettings.enabled, true), or(isNull(notificationDeliveries.nextAttemptAt), lte(notificationDeliveries.nextAttemptAt, now)))).orderBy(asc(notificationDeliveries.createdAt)).limit(limit)
  let sent = 0; let nextRetryAt: Date | undefined
  for (const { delivery, settings } of rows) {
    const attemptedAt = new Date()
    try {
      const endpoint = ntfyEndpointSchema.parse(settings.endpoint)
      if (!settings.topic) throw new Error('Notifications are enabled without an ntfy topic')
      const response = await fetcher(`${endpoint}/${encodeURIComponent(settings.topic)}`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'text/plain; charset=utf-8', title: delivery.payload.title, tags: delivery.payload.tags?.join(',') ?? '' }, body: delivery.payload.body, signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`ntfy responded with HTTP ${response.status}`)
      await db.update(notificationDeliveries).set({ status: 'sent', attemptedAt, sentAt: new Date(), error: null, attemptCount: delivery.attemptCount + 1, nextAttemptAt: null }).where(eq(notificationDeliveries.id, delivery.id)); sent += 1
    } catch (error) {
      const attempts = delivery.attemptCount + 1; const retry = attempts < 4
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Notification delivery failed'
      const retryAt = retry ? new Date(attemptedAt.getTime() + Math.min(60, 2 ** attempts) * 60_000) : null
      if (retryAt && (!nextRetryAt || retryAt < nextRetryAt)) nextRetryAt = retryAt
      await db.update(notificationDeliveries).set({ status: retry ? 'queued' : 'failed', attemptedAt, error: message, attemptCount: attempts, nextAttemptAt: retryAt }).where(eq(notificationDeliveries.id, delivery.id))
    }
  }
  // A full successful batch can still leave ready work behind, while failures
  // leave a future retry. Re-read the queue so the worker always gets the
  // earliest eligible wakeup rather than stranding either case.
  const eligibleQueue = and(eq(notificationDeliveries.status, 'queued'), eq(notificationSettings.enabled, true))
  const [readyDelivery] = await db.select({ id: notificationDeliveries.id }).from(notificationDeliveries)
    .innerJoin(notificationSettings, eq(notificationSettings.userId, notificationDeliveries.userId))
    .where(and(eligibleQueue, or(isNull(notificationDeliveries.nextAttemptAt), lte(notificationDeliveries.nextAttemptAt, now))))
    .limit(1)
  const [futureDelivery] = readyDelivery ? [] : await db.select({ nextAttemptAt: notificationDeliveries.nextAttemptAt }).from(notificationDeliveries)
    .innerJoin(notificationSettings, eq(notificationSettings.userId, notificationDeliveries.userId))
    .where(and(eligibleQueue, gt(notificationDeliveries.nextAttemptAt, now)))
    .orderBy(asc(notificationDeliveries.nextAttemptAt))
    .limit(1)
  const nextDeliveryAt = readyDelivery ? now : futureDelivery?.nextAttemptAt ?? undefined

  return { attempted: rows.length, sent, nextRetryAt, nextDeliveryAt }
}
