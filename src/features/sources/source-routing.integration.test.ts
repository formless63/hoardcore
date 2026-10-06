import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { catalogSources, collectionRuns, mediaCaptureRuns, sourceOriginSafety, sourceRouting } from '~/server/db/schema'
import { readSourceProxy, readSourceRouting, saveSourceRoutingInDatabase } from './source-routing.server'

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.BETTER_AUTH_SECRET ??= 'routing-test-encryption-root-not-for-production'
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip
suite('durable source routing', () => {
  const origin = `https://routing-${crypto.randomUUID()}.example.test`
  const db = () => getDatabase()
  let source: typeof catalogSources.$inferSelect
  beforeAll(async () => {
    ;[source] = await db().insert(catalogSources).values({ moduleId: 'shopify', displayName: 'Routing fixture', sourceKey: origin, config: { catalogUrl: `${origin}/collections/sale` } }).returning()
    await db().insert(sourceOriginSafety).values({ origin, blockedUntil: new Date(Date.now() + 72 * 3600000), throttleStrikes: 2, nextRequestAt: new Date(Date.now() + 60000) })
  })
  afterAll(async () => {
    await db().delete(catalogSources).where(eq(catalogSources.id, source.id))
    await db().delete(sourceOriginSafety).where(eq(sourceOriginSafety.origin, origin))
    await closeDatabase()
  })
  it('defaults to direct; stores only encrypted passwords and preserves the complete safety state', async () => {
    expect(await readSourceRouting(db(), source.id)).toEqual({ mode: 'direct', endpoint: '', username: '', hasPassword: false })
    const before = await db().select().from(sourceOriginSafety).where(eq(sourceOriginSafety.origin, origin))
    const saved = await saveSourceRoutingInDatabase(db(), { sourceId: source.id, mode: 'http_proxy', endpoint: 'http://proxy:8888', username: 'fixture', password: 'private-password' })
    expect(saved).toEqual({ mode: 'http_proxy', endpoint: 'http://proxy:8888/', username: 'fixture', hasPassword: true })
    expect(JSON.stringify(saved)).not.toContain('private-password')
    expect(JSON.stringify(await db().select().from(sourceRouting).where(eq(sourceRouting.sourceId, source.id)))).not.toContain('private-password')
    expect(await readSourceProxy(db(), source.id)).toMatchObject({ password: 'private-password' })
    await saveSourceRoutingInDatabase(db(), { sourceId: source.id, mode: 'http_proxy', endpoint: 'http://proxy:8888', username: 'fixture' })
    expect(await readSourceProxy(db(), source.id)).toMatchObject({ password: 'private-password' })
    await expect(saveSourceRoutingInDatabase(db(), { sourceId: source.id, mode: 'http_proxy', endpoint: 'http://another-proxy:8888', username: 'fixture' })).rejects.toThrow('Re-enter')
    await saveSourceRoutingInDatabase(db(), { sourceId: source.id, mode: 'direct' })
    expect(await readSourceProxy(db(), source.id)).toBeUndefined()
    expect((await readSourceRouting(db(), source.id)).hasPassword).toBe(false)
    expect(await db().select().from(sourceOriginSafety).where(eq(sourceOriginSafety.origin, origin))).toEqual(before)
  })
  it('blocks routing changes during collection and photo runs', async () => {
    const [run] = await db().insert(collectionRuns).values({ sourceId: source.id }).returning()
    await expect(saveSourceRoutingInDatabase(db(), { sourceId: source.id, mode: 'direct' })).rejects.toThrow('active collection and photo')
    await db().delete(collectionRuns).where(eq(collectionRuns.id, run.id))
    const [photo] = await db().insert(mediaCaptureRuns).values({ sourceId: source.id, requestLimit: 1 }).returning()
    await expect(saveSourceRoutingInDatabase(db(), { sourceId: source.id, mode: 'direct' })).rejects.toThrow('active collection and photo')
    await db().delete(mediaCaptureRuns).where(eq(mediaCaptureRuns.id, photo.id))
  })
})
