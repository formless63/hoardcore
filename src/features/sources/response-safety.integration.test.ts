import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { catalogSources, notificationDeliveries, notificationSettings, sourceOriginSafety, sourceResponseSubscriptions, sourceSafetyEvents, user } from '~/server/db/schema'
import { assertSourceOriginAvailable, claimSourceScan, readSourceSafety, recordSourceRecovery, saveSourceSafetyInDatabase, setSourceSafetyBreakInDatabase, withSourceResponseSafety } from './response-safety.server'
import { defaultResponsePolicy } from './response-policy'

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const databaseSuite = process.env.TEST_DATABASE_URL ? describe : describe.skip
databaseSuite('durable source response safety', () => {
  const suffix = crypto.randomUUID()
  const origin = `https://safety-${suffix}.example.test`
  const mediaOrigin = `https://media-${suffix}.example.test`
  const userId = `safety-${suffix}`
  let source: typeof catalogSources.$inferSelect
  let sibling: typeof catalogSources.$inferSelect
  const db = () => getDatabase()
  beforeAll(async () => {
    ;[source, sibling] = await db().insert(catalogSources).values(['first', 'second'].map(scope => ({ moduleId: 'shopify', displayName: `Safety ${scope}`, sourceKey: `${origin.slice(8)}/collections/${scope}`, config: { catalogUrl: `${origin}/collections/${scope}`, robotsPolicy: 'operator_approved' } }))).returning()
    const now = new Date()
    await db().insert(user).values({ id: userId, name: 'Safety subscriber', email: `${userId}@example.test`, createdAt: now, updatedAt: now })
    await db().insert(notificationSettings).values({ userId, enabled: true, endpoint: 'https://ntfy-safety.example.test', topic: 'safety-test-topic' })
    await db().insert(sourceResponseSubscriptions).values({ sourceId: source.id, userId, eventTypes: ['throttled', 'recovered'] })
  })
  afterAll(async () => {
    await db().delete(catalogSources).where(inArray(catalogSources.id, [source.id, sibling.id]))
    await db().delete(sourceOriginSafety).where(inArray(sourceOriginSafety.origin, [origin, mediaOrigin]))
    await db().delete(user).where(eq(user.id, userId))
    await closeDatabase()
  })
  it('stops after exactly one 429, blocks sibling scopes and queues one notification', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': '60' } }))
    const guarded = withSourceResponseSafety(db(), source, request)
    await expect(guarded(`${origin}/products.json`, {})).rejects.toThrow('cooldown until')
    await expect(guarded(`${origin}/products.json`, {})).rejects.toThrow('cooling down')
    await expect(withSourceResponseSafety(db(), sibling, request)(`${origin}/products.json`, {})).rejects.toThrow('cooling down')
    expect(request).toHaveBeenCalledTimes(1)
    const settings = await readSourceSafety(db(), source.id, userId)
    expect(settings.state?.throttleStrikes).toBe(1)
    expect(settings.state!.blockedUntil!.getTime() - Date.now()).toBeGreaterThan(23 * 3_600_000)
    expect(settings.eventTypes).toEqual(['throttled', 'recovered'])
    const deliveries = await db().select().from(notificationDeliveries).where(eq(notificationDeliveries.userId, userId))
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]).toMatchObject({ listingId: null, eventType: 'source_response', status: 'queued' })
  })
  it('persists the gate across database reconnection and blocks scan admission', async () => {
    await closeDatabase()
    await expect(assertSourceOriginAvailable(db(), origin)).rejects.toThrow('cooling down')
    await expect(claimSourceScan(db(), sibling, true)).rejects.toThrow('cooling down')
  })
  it('counts only probes after cooldown and clears strikes only on complete recovery', async () => {
    await db().update(sourceOriginSafety).set({ blockedUntil: new Date(0), nextRequestAt: null }).where(eq(sourceOriginSafety.origin, origin))
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 429 }))
    await expect(withSourceResponseSafety(db(), source, request)(`${origin}/products.json`, {})).rejects.toThrow('cooldown until')
    let safety = await readSourceSafety(db(), source.id, userId)
    expect(safety.state?.throttleStrikes).toBe(2)
    expect(safety.state!.blockedUntil!.getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000)
    await recordSourceRecovery(db(), source)
    expect((await readSourceSafety(db(), source.id, userId)).state?.throttleStrikes).toBe(2)
    await db().update(sourceOriginSafety).set({ blockedUntil: new Date(0), nextRequestAt: null }).where(eq(sourceOriginSafety.origin, origin))
    await recordSourceRecovery(db(), source)
    safety = await readSourceSafety(db(), source.id, userId)
    expect(safety.state).toMatchObject({ throttleStrikes: 0, lastEvent: 'recovered' })
  })
  it('applies media-host throttling to both the CDN and the registered source', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 429 }))
    await expect(withSourceResponseSafety(db(), source, request)(`${mediaOrigin}/image.png`, {})).rejects.toThrow('cooldown until')
    await expect(assertSourceOriginAvailable(db(), mediaOrigin)).rejects.toThrow('cooling down')
    await expect(assertSourceOriginAvailable(db(), origin)).rejects.toThrow('cooling down')
    const entries = await db().select().from(sourceSafetyEvents).where(eq(sourceSafetyEvents.sourceId, source.id))
    expect(entries.some(event => event.origin === mediaOrigin)).toBe(true)
  })
  it('enforces the minimum interval across scopes with an atomic scan claim', async () => {
    await db().update(sourceOriginSafety).set({ blockedUntil: null, paused: false, lastScanAt: null }).where(eq(sourceOriginSafety.origin, origin))
    const results = await Promise.allSettled([claimSourceScan(db(), source, true), claimSourceScan(db(), sibling, true)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  })
  it('persists settings and subscriptions without shortening an existing break', async () => {
    const settings = await setSourceSafetyBreakInDatabase(db(), userId, { sourceId: source.id, action: 'break', hours: 72 })
    const saved = await saveSourceSafetyInDatabase(db(), userId, { sourceId: source.id, policy: { ...defaultResponsePolicy, minimumDelaySeconds: 30, minimumScanHours: 48 }, eventTypes: ['network_error'] })
    expect(saved.policy).toMatchObject({ minimumDelaySeconds: 30, minimumScanHours: 48 })
    expect(saved.eventTypes).toEqual(['network_error'])
    expect(saved.state?.blockedUntil).toEqual(settings.state?.blockedUntil)
    const shorter = await setSourceSafetyBreakInDatabase(db(), userId, { sourceId: source.id, action: 'break', hours: 1 })
    expect(shorter.state?.blockedUntil).toEqual(settings.state?.blockedUntil)
    await expect(setSourceSafetyBreakInDatabase(db(), userId, { sourceId: source.id, action: 'resume', hours: 1 })).rejects.toThrow('must expire')
  })
  it('allows review resume after expiry while retaining strikes', async () => {
    await db().update(sourceOriginSafety).set({ paused: true, blockedUntil: new Date(0), throttleStrikes: 3 }).where(eq(sourceOriginSafety.origin, origin))
    const resumed = await setSourceSafetyBreakInDatabase(db(), userId, { sourceId: source.id, action: 'resume', hours: 1 })
    expect(resumed.state).toMatchObject({ paused: false, throttleStrikes: 3 })
    await expect(assertSourceOriginAvailable(db(), origin)).resolves.toBeDefined()
  })
  it('serializes simultaneous attempts so only the first sends traffic on rejection', async () => {
    await db().update(sourceOriginSafety).set({ blockedUntil: null, paused: false, nextRequestAt: null }).where(eq(sourceOriginSafety.origin, origin))
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    const guarded = withSourceResponseSafety(db(), source, request)
    const results = await Promise.allSettled([guarded(`${origin}/products.json`, {}), guarded(`${origin}/products.json`, {})])
    expect(request).toHaveBeenCalledTimes(1)
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect((await readSourceSafety(db(), source.id, userId)).state?.paused).toBe(true)
  })
  it('stops on a timeout without another network attempt', async () => {
    await db().update(sourceOriginSafety).set({ blockedUntil: null, paused: false, nextRequestAt: null }).where(eq(sourceOriginSafety.origin, origin))
    const request = vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError'))
    const guarded = withSourceResponseSafety(db(), source, request)
    await expect(guarded(`${origin}/products.json`, {})).rejects.toThrow('timeout')
    await expect(guarded(`${origin}/products.json`, {})).rejects.toThrow('cooling down')
    expect(request).toHaveBeenCalledTimes(1)
    expect((await readSourceSafety(db(), source.id, userId)).state?.lastEvent).toBe('timeout')
  })
})
