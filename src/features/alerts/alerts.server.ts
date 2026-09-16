import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm'
import type { Database } from '~/server/db/db.server'
import { notificationDeliveries, notificationSettings, savedViewNotificationRules, type AlertEventType } from '~/server/db/schema/alerts'
import { sourceEvidence, sourceListingObservations } from '~/server/db/schema/catalog'
import { catalogProducts, sourceListings } from '~/server/db/schema/catalog'
import { savedListingViews } from '~/server/db/schema/saved-listing-views'
import type { CurrentListing } from '~/features/catalog/catalog.schemas'
import { listingFiltersSchema, matchesListingFilters } from '~/features/catalog/listing-filters'
import { listCurrentCatalogListings } from '~/server/db/catalog-persistence.server'
import { watchedListings } from '~/server/db/schema/watched-listings'
import { ntfyEndpointSchema, type NotificationSettingsInput } from './alerts.schemas'

export type AlertEvent = {
  listing: CurrentListing
  observationId: string
  eventType: AlertEventType
  /** Present for later observations so saved views can detect entry transitions. */
  previousListing?: CurrentListing
  /** Watches define “new” as the first recorded observation, unlike saved views. */
  firstObservation?: boolean
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

/** Store a delivery intent once per user, rule/item, listing, observation, and event. */
export async function queueAlertForEvent(db: Database, event: AlertEvent) {
  const watches = await db.select().from(watchedListings).where(and(eq(watchedListings.listingId, event.listing.id), eq(watchedListings.alertsEnabled, true)))
  const viewRules = await db.select({ rule: savedViewNotificationRules, view: savedListingViews }).from(savedViewNotificationRules).innerJoin(savedListingViews, eq(savedListingViews.id, savedViewNotificationRules.savedViewId)).where(eq(savedViewNotificationRules.enabled, true))
  const candidates = [
    ...watches.filter((watch) => watch.createdAt <= event.listing.observedAt && watch.eventTypes.includes(event.eventType) && (event.eventType !== 'new_match' || event.firstObservation)).map((watch) => ({ userId: watch.userId, kind: 'watch' as const, ruleId: watch.id, savedViewId: null, reason: 'Watched listing changed' })),
    ...viewRules.filter(({ rule, view }) => {
      if (rule.createdAt > event.listing.observedAt || !rule.eventTypes.includes(event.eventType)) return false
      const filters = listingFiltersSchema.parse(view.filters)
      if (!matchesListingFilters(event.listing, filters)) return false
      return event.eventType !== 'new_match' || event.previousListing === undefined || !matchesListingFilters(event.previousListing, filters)
    }).map(({ rule, view }) => ({ userId: rule.userId, kind: 'saved_view' as const, ruleId: rule.id, savedViewId: view.id, reason: `Matched saved view “${view.name}”` })),
  ]
  if (!candidates.length) return { queued: 0 }
  const settings = await db.select().from(notificationSettings).where(and(inArray(notificationSettings.userId, [...new Set(candidates.map((candidate) => candidate.userId))]), eq(notificationSettings.enabled, true)))
  const enabledUsers = new Set(settings.filter((setting) => setting.topic).map((setting) => setting.userId))
  let queued = 0
  for (const candidate of candidates) {
    if (!enabledUsers.has(candidate.userId)) continue
    const [row] = await db.insert(notificationDeliveries).values({ userId: candidate.userId, listingId: event.listing.id, observationId: event.observationId, savedViewId: candidate.savedViewId, kind: candidate.kind, eventType: event.eventType, dedupeKey: `${candidate.kind}:${candidate.ruleId}:${event.listing.id}:${event.observationId}:${event.eventType}`, payload: alertPayload(event, candidate.reason) }).onConflictDoNothing({ target: [notificationDeliveries.userId, notificationDeliveries.dedupeKey] }).returning({ id: notificationDeliveries.id })
    if (row) queued += 1
  }
  return { queued }
}

/** Only inspect observations from this run, so delayed workers never replay old history. */
export async function queueAlertsForCollectionRun(db: Database, input: { runId: string; listingIds: string[] }) {
  if (!input.listingIds.length) return { events: 0, queued: 0 }
  const rows = await db.select({ observation: sourceListingObservations }).from(sourceListingObservations).innerJoin(sourceEvidence, eq(sourceEvidence.id, sourceListingObservations.evidenceId)).where(and(eq(sourceEvidence.runId, input.runId), inArray(sourceListingObservations.listingId, input.listingIds)))
  if (!rows.length) return { events: 0, queued: 0 }
  const current = new Map((await listCurrentCatalogListings(db)).map((listing) => [listing.id, listing]))
  let events = 0; let queued = 0
  for (const { observation } of rows) {
    const listing = current.get(observation.listingId)
    if (!listing || listing.observedAt.getTime() !== observation.observedAt.getTime()) continue
    const history = await db.select().from(sourceListingObservations).where(eq(sourceListingObservations.listingId, observation.listingId)).orderBy(asc(sourceListingObservations.observedAt))
    const position = history.findIndex((entry) => entry.id === observation.id)
    const previous = history[position - 1]
    const previousListing = previous === undefined ? undefined : { ...listing, title: previous.title, price: previous.price, compareAtPrice: previous.compareAtPrice, currency: previous.currency, available: previous.available, observedAt: previous.observedAt }
    const types: AlertEventType[] = previous === undefined ? ['new_match'] : [...(previous.price !== observation.price ? ['price_change' as const] : []), ...(previous.available !== observation.available ? ['availability_change' as const] : []), 'new_match']
    for (const eventType of types) { events += 1; queued += (await queueAlertForEvent(db, { listing, observationId: observation.id, eventType, previousListing, firstObservation: previous === undefined })).queued }
  }
  return { events, queued }
}

export interface NtfyFetchResponse { ok: boolean; status: number; text(): Promise<string> }
export type NtfyFetch = (input: string, init: RequestInit) => Promise<NtfyFetchResponse>

/** Bounded retries use durable backoff; they never trigger another source collection. */
export async function deliverQueuedNtfyNotifications(db: Database, fetcher: NtfyFetch = fetch, limit = 20) {
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
  return { attempted: rows.length, sent, nextRetryAt }
}
