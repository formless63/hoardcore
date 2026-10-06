import { and, desc, eq, sql } from 'drizzle-orm'
import type { Database } from '~/server/db/db.server'
import { catalogSources, notificationDeliveries, notificationSettings, sourceOriginSafety, sourceResponsePolicies, sourceResponseSubscriptions, sourceSafetyEvents } from '~/server/db/schema'
import { classifyResponse, responseDecision, responseEventLabels, responsePolicySchema, type ResponseEventType, type ResponsePolicy } from './response-policy'
import { getSourceModule } from '~/modules/registry'
import { cooldownReleaseInputSchema } from './cooldown-release.schemas'

import { SourceSafetyStop } from '~/lib/source-safety-error'
export { SourceSafetyStop } from '~/lib/source-safety-error'
export function sourceOrigin(source: typeof catalogSources.$inferSelect) {
  const origin = getSourceModule(source.moduleId)?.collectionOrigin?.(source.config)
  if (!origin) throw new SourceSafetyStop('This source module does not expose a collection origin')
  return new URL(origin).origin
}
export async function readResponsePolicy(db: Database, sourceId: string) {
  const [row] = await db.select().from(sourceResponsePolicies).where(eq(sourceResponsePolicies.sourceId, sourceId))
  return responsePolicySchema.parse(row?.policy ?? {})
}
export async function assertSourceOriginAvailable(db: Database, origin: string) {
  const [state] = await db.select().from(sourceOriginSafety).where(eq(sourceOriginSafety.origin, origin))
  if (state?.paused) throw new SourceSafetyStop(`Source paused for review: ${state.reason ?? origin}`)
  if (state?.blockedUntil && state.blockedUntil.getTime() > Date.now()) {
    throw new SourceSafetyStop(`Source cooling down until ${state.blockedUntil.toISOString()}: ${state.reason ?? origin}`)
  }
  return state
}

/** One origin lock protects scan starts across registrations, workers and manual requests. */
export async function claimSourceScan(db: Database, source: typeof catalogSources.$inferSelect, claim = false) {
  const origin = sourceOrigin(source)
  const policy = await readResponsePolicy(db, source.id)
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${origin}, 0))`)
    const store = tx as unknown as Database
    const state = await assertSourceOriginAvailable(store, origin)
    if (state?.lastScanAt && state.lastScanAt.getTime() + policy.minimumScanHours * 3_600_000 > Date.now()) {
      throw new SourceSafetyStop(`Minimum scan interval ends at ${new Date(state.lastScanAt.getTime() + policy.minimumScanHours * 3_600_000).toISOString()}`)
    }
    if (claim) await tx.insert(sourceOriginSafety).values({ origin, lastScanAt: new Date() })
      .onConflictDoUpdate({ target: sourceOriginSafety.origin, set: { lastScanAt: new Date() } })
  })
}

export async function recordResponseEvent(db: Database, source: typeof catalogSources.$inferSelect, origin: string, event: Exclude<ResponseEventType, 'recovered'>, retryAfter: string | null, notify = true) {
  const policy = await readResponsePolicy(db, source.id)
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${origin}, 0))`)
    const [prior] = await tx.select().from(sourceOriginSafety).where(eq(sourceOriginSafety.origin, origin))
    // A concurrent request can fail too; it must not count as another recovery probe.
    if (prior?.paused || prior?.blockedUntil && prior.blockedUntil.getTime() > Date.now()) return prior.reason ?? 'Source cooldown is active'
    const strikes = event === 'throttled' ? (prior?.throttleStrikes ?? 0) + 1 : prior?.throttleStrikes ?? 0
    const decision = responseDecision(policy, event, strikes, retryAfter)
    const message = `${source.displayName}: ${responseEventLabels[event]}; ${decision.paused ? 'paused for operator review; ' : ''}cooldown until ${decision.until.toISOString()}.`
    await tx.insert(sourceOriginSafety).values({ origin, blockedUntil: decision.until, paused: decision.paused, throttleStrikes: strikes, lastEvent: event, lastEventAt: new Date(), reason: message })
      .onConflictDoUpdate({ target: sourceOriginSafety.origin, set: { blockedUntil: decision.until, paused: decision.paused, throttleStrikes: strikes, lastEvent: event, lastEventAt: new Date(), reason: message } })
    const [entry] = await tx.insert(sourceSafetyEvents).values({ sourceId: source.id, origin, eventType: event, message }).returning()
    if (entry && notify) await queueSafetyNotifications(tx as unknown as Database, source.id, entry.id, event, message)
    return message
  })
}

async function queueSafetyNotifications(db: Database, sourceId: string, eventId: string, event: ResponseEventType, message: string) {
  const subscriptions = await db.select({ subscription: sourceResponseSubscriptions, settings: notificationSettings })
    .from(sourceResponseSubscriptions).innerJoin(notificationSettings, eq(notificationSettings.userId, sourceResponseSubscriptions.userId))
    .where(and(eq(sourceResponseSubscriptions.sourceId, sourceId), eq(notificationSettings.enabled, true)))
  for (const { subscription, settings } of subscriptions) {
    if (!settings.topic || !subscription.eventTypes.includes(event)) continue
    await db.insert(notificationDeliveries).values({ userId: subscription.userId, kind: 'source_response', eventType: 'source_response',
      dedupeKey: `source-response:${eventId}`, payload: { title: 'Hoardcore source status', body: message, tags: [event === 'recovered' ? 'white_check_mark' : 'warning'] } }).onConflictDoNothing()
  }
}

interface SafetyResponse { status: number; headers: Headers | Readonly<Record<string, string | undefined>>; body?: ReadableStream<Uint8Array> | null }

/** Wrap every source HTTP acquisition, including preflights and supplements. */
export function withSourceResponseSafety<I, R extends SafetyResponse>(db: Database, source: typeof catalogSources.$inferSelect, request: (url: string, init: I) => Promise<R>) {
  const registeredOrigin = sourceOrigin(source)
  return async (url: string, init: I): Promise<R> => {
    const [currentSource] = await db.select({ enabled: catalogSources.collectionEnabled }).from(catalogSources).where(eq(catalogSources.id, source.id))
    if (!currentSource?.enabled) throw new SourceSafetyStop('Collection is paused for this source')
    const origin = new URL(url).origin
    await assertSourceOriginAvailable(db, registeredOrigin)
    await assertSourceOriginAvailable(db, origin)
    const policy = await readResponsePolicy(db, source.id)
    // Hold the origin lock through the request to prevent overlapping acquisitions.
    const outcome = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${origin}, 0))`)
      const store = tx as unknown as Database
      const state = await assertSourceOriginAvailable(store, origin)
      await assertSourceOriginAvailable(store, registeredOrigin)
      const [current] = await tx.select({ enabled: catalogSources.collectionEnabled }).from(catalogSources).where(eq(catalogSources.id, source.id))
      if (!current?.enabled) throw new SourceSafetyStop('Collection is paused for this source')
      if (typeof init === 'object' && init !== null && 'signal' in init && init.signal instanceof AbortSignal && init.signal.aborted) {
        throw new SourceSafetyStop('Request deadline expired while waiting for pacing; no source request was sent')
      }
      const waitMs = Math.max(0, (state?.nextRequestAt?.getTime() ?? 0) - Date.now())
      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs))
      // A cooldown on the registered origin may have changed during the wait.
      await assertSourceOriginAvailable(store, registeredOrigin)
      if (typeof init === 'object' && init !== null && 'signal' in init && init.signal instanceof AbortSignal && init.signal.aborted) {
        throw new SourceSafetyStop('Request deadline expired while waiting for pacing; no source request was sent')
      }
      let response: R
      try { response = await request(url, init) }
      catch (error) {
        if (error instanceof SourceSafetyStop) throw error
        const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
        const event = timeout ? 'timeout' : 'network_error'
        const message = await recordResponseEvent(store, source, origin, event, null)
        if (origin !== registeredOrigin) await recordResponseEvent(store, source, registeredOrigin, event, null, false)
        return { message }
      }
      await tx.insert(sourceOriginSafety).values({ origin, nextRequestAt: new Date(Date.now() + policy.minimumDelaySeconds * 1000) })
        .onConflictDoUpdate({ target: sourceOriginSafety.origin, set: { nextRequestAt: new Date(Date.now() + policy.minimumDelaySeconds * 1000) } })
      const failure = classifyResponse(response.status)
      if (!failure) return { response }
      const retryAfter = response.headers instanceof Headers
        ? response.headers.get('retry-after') : Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'retry-after')?.[1] ?? null
      await response.body?.cancel().catch(() => undefined)
      const message = await recordResponseEvent(store, source, origin, failure, retryAfter)
      if (origin !== registeredOrigin) await recordResponseEvent(store, source, registeredOrigin, failure, retryAfter, false)
      return { message }
    })
    if (outcome.message) throw new SourceSafetyStop(outcome.message)
    if (!outcome.response) throw new SourceSafetyStop('Source request stopped')
    return outcome.response
  }
}

export async function recordSourceRecovery(db: Database, source: typeof catalogSources.$inferSelect) {
  const origin = sourceOrigin(source)
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${origin}, 0))`)
    const [state] = await tx.select().from(sourceOriginSafety).where(eq(sourceOriginSafety.origin, origin))
    if (!state?.lastEvent || state.lastEvent === 'recovered' || state.paused || state.blockedUntil && state.blockedUntil.getTime() > Date.now()) return false
    await tx.update(sourceOriginSafety).set({ throttleStrikes: 0, lastEvent: 'recovered', lastEventAt: new Date(), reason: null, blockedUntil: null }).where(eq(sourceOriginSafety.origin, origin))
    const message = `${source.displayName}: complete collection succeeded; response safety strikes reset.`
    const [entry] = await tx.insert(sourceSafetyEvents).values({ sourceId: source.id, origin, eventType: 'recovered', message }).returning()
    if (entry) await queueSafetyNotifications(tx as unknown as Database, source.id, entry.id, 'recovered', message)
    return true
  })
}

export async function readSourceSafety(db: Database, sourceId: string, userId: string) {
  const [source] = await db.select().from(catalogSources).where(eq(catalogSources.id, sourceId))
  if (!source) throw new Error('Source not found')
  const origin = sourceOrigin(source)
  const [state] = await db.select().from(sourceOriginSafety).where(eq(sourceOriginSafety.origin, origin))
  const [subscription] = await db.select().from(sourceResponseSubscriptions).where(and(eq(sourceResponseSubscriptions.sourceId, sourceId), eq(sourceResponseSubscriptions.userId, userId)))
  const events = await db.select().from(sourceSafetyEvents).where(eq(sourceSafetyEvents.origin, origin)).orderBy(desc(sourceSafetyEvents.createdAt)).limit(20)
  const [notifications] = await db.select({ enabled: notificationSettings.enabled, topic: notificationSettings.topic }).from(notificationSettings).where(eq(notificationSettings.userId, userId))
  return { origin, collectionEnabled: source.collectionEnabled, policy: await readResponsePolicy(db, sourceId), state: state ?? null, eventTypes: subscription?.eventTypes ?? [], events, notificationsReady: Boolean(notifications?.enabled && notifications.topic) }
}

export async function saveSourceSafetyInDatabase(db: Database, userId: string, input: { sourceId: string; policy: ResponsePolicy; eventTypes: ResponseEventType[] }) {
  const policy = responsePolicySchema.parse(input.policy)
  await db.transaction(async tx => {
    const [source] = await tx.select({ id: catalogSources.id }).from(catalogSources).where(eq(catalogSources.id, input.sourceId))
    if (!source) throw new Error('Source not found')
    await tx.insert(sourceResponsePolicies).values({ sourceId: input.sourceId, policy }).onConflictDoUpdate({ target: sourceResponsePolicies.sourceId, set: { policy } })
    await tx.insert(sourceResponseSubscriptions).values({ sourceId: input.sourceId, userId, eventTypes: [...new Set(input.eventTypes)] }).onConflictDoUpdate({ target: [sourceResponseSubscriptions.sourceId, sourceResponseSubscriptions.userId], set: { eventTypes: [...new Set(input.eventTypes)] } })
  })
  return readSourceSafety(db, input.sourceId, userId)
}

export async function setSourceSafetyBreakInDatabase(db: Database, userId: string, input: { sourceId: string; action: 'break' | 'pause' | 'resume'; hours: number }) {
  const [source] = await db.select().from(catalogSources).where(eq(catalogSources.id, input.sourceId))
  if (!source) throw new Error('Source not found')
  const origin = sourceOrigin(source)
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${origin}, 0))`)
    const [prior] = await tx.select().from(sourceOriginSafety).where(eq(sourceOriginSafety.origin, origin))
    if (input.action === 'resume' && prior?.blockedUntil && prior.blockedUntil.getTime() > Date.now()) throw new Error('The required cooldown must expire before resuming')
    const blockedUntil = input.action === 'resume' ? prior?.blockedUntil ?? null : new Date(Math.max(prior?.blockedUntil?.getTime() ?? 0, Date.now() + input.hours * 3_600_000))
    const paused = input.action === 'pause' || input.action !== 'resume' && (prior?.paused ?? false)
    const message = input.action === 'resume' ? 'Operator resumed collection after review; strike history retained.' : `Operator ${paused ? 'paused collection' : 'requested a break'} until ${blockedUntil!.toISOString()}.`
    await tx.insert(sourceOriginSafety).values({ origin, blockedUntil, paused, reason: message }).onConflictDoUpdate({ target: sourceOriginSafety.origin, set: { blockedUntil, paused, reason: message } })
    await tx.insert(sourceSafetyEvents).values({ sourceId: input.sourceId, origin, eventType: input.action === 'resume' ? 'operator_resume' : 'operator_break', message })
  })
  return readSourceSafety(db, input.sourceId, userId)
}

/** Explicit operator override; ordinary resume still waits for expiry. */
export async function releaseSourceCooldownInDatabase(db: Database, userId: string, input: unknown) {
  const data = cooldownReleaseInputSchema.parse(input)
  const [source] = await db.select().from(catalogSources).where(eq(catalogSources.id, data.sourceId))
  if (!source) throw new Error('Source not found')
  const origin = sourceOrigin(source)
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${origin}, 0))`)
    const [prior] = await tx.select().from(sourceOriginSafety).where(eq(sourceOriginSafety.origin, origin))
    if (!prior || !prior.blockedUntil && !prior.paused) throw new Error('There is no cooldown or review pause to release')
    if ((prior.blockedUntil?.toISOString() ?? null) !== data.expectedBlockedUntil || prior.paused !== data.expectedPaused)
      throw new Error('Source safety state changed. Refresh and confirm the current cooldown before releasing it.')
    const paused = prior.paused && !data.resume
    const message = `Operator ${userId} explicitly released the cooldown ending ${prior.blockedUntil?.toISOString() ?? 'without a deadline'}${data.resume && prior.paused ? ' and lifted the review pause' : paused ? '; review pause retained' : ''}. Reason: ${data.reason}. Strike history, request pacing, scan interval, and budgets retained. No scan queued.`
    await tx.update(sourceOriginSafety).set({ blockedUntil: null, paused, reason: message }).where(eq(sourceOriginSafety.origin, origin))
    await tx.insert(sourceSafetyEvents).values({ sourceId: source.id, origin, eventType: 'operator_release', message })
  })
  return readSourceSafety(db, source.id, userId)
}
