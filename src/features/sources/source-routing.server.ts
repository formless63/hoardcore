import { and, eq, inArray } from 'drizzle-orm'
import type { Database } from '~/server/db/db.server'
import { catalogSources, collectionRuns, mediaCaptureRuns, sourceRouting, sourceSafetyEvents } from '~/server/db/schema'
import { sourceOrigin } from './response-safety.server'
import { decryptProxyPassword, encryptProxyPassword } from './source-routing-crypto.server'
import { proxyEndpointSchema, sourceRoutingInputSchema, type SourceProxy, type SourceRoutingSummary } from './source-routing.schemas'

function summarize(row?: typeof sourceRouting.$inferSelect): SourceRoutingSummary {
  return { mode: row?.mode ?? 'direct', endpoint: row?.endpoint ?? '', username: row?.username ?? '', hasPassword: Boolean(row?.encryptedPassword) }
}

export async function readSourceRouting(db: Database, sourceId: string) {
  const [source] = await db.select({ id: catalogSources.id }).from(catalogSources).where(eq(catalogSources.id, sourceId))
  if (!source) throw new Error('Source not found')
  const [row] = await db.select().from(sourceRouting).where(eq(sourceRouting.sourceId, sourceId))
  return summarize(row)
}

export async function readSourceProxy(db: Database, sourceId: string): Promise<SourceProxy | undefined> {
  const [row] = await db.select().from(sourceRouting).where(eq(sourceRouting.sourceId, sourceId))
  if (!row || row.mode === 'direct') return undefined
  if (row.mode !== 'http_proxy') throw new Error('Unsupported source routing mode')
  return { endpoint: proxyEndpointSchema.parse(row.endpoint), username: row.username,
    password: row.encryptedPassword ? decryptProxyPassword(row.encryptedPassword, sourceId) : '' }
}

export async function saveSourceRoutingInDatabase(db: Database, input: unknown) {
  const data = sourceRoutingInputSchema.parse(input)
  return db.transaction(async tx => {
    const [source] = await tx.select().from(catalogSources).where(eq(catalogSources.id, data.sourceId)).for('update')
    if (!source) throw new Error('Source not found')
    for (const runs of [collectionRuns, mediaCaptureRuns]) {
      const [active] = await tx.select({ id: runs.id }).from(runs).where(and(eq(runs.sourceId, data.sourceId), inArray(runs.status, ['queued', 'running']))).limit(1)
      if (active) throw new Error('Wait for active collection and photo runs to finish before changing routing')
    }
    const [prior] = await tx.select().from(sourceRouting).where(eq(sourceRouting.sourceId, data.sourceId))
    // Avoid sending a saved password to a different proxy by accident.
    const endpoint = data.mode === 'http_proxy' ? new URL(data.endpoint).href : ''
    const identityChanged = prior && (prior.endpoint !== endpoint || prior.username !== data.username)
    if (data.mode === 'http_proxy' && identityChanged && prior.encryptedPassword && !data.password && !data.clearPassword)
      throw new Error('Re-enter or explicitly clear the password when changing proxy address or username')
    const encryptedPassword = data.mode === 'direct' || data.clearPassword ? null
      : data.password ? encryptProxyPassword(data.password, data.sourceId) : prior?.encryptedPassword ?? null
    const values = { mode: data.mode, endpoint, username: data.mode === 'direct' ? '' : data.username, encryptedPassword, updatedAt: new Date() }
    const [row] = await tx.insert(sourceRouting).values({ sourceId: data.sourceId, ...values })
      .onConflictDoUpdate({ target: sourceRouting.sourceId, set: values }).returning()
    await tx.insert(sourceSafetyEvents).values({ sourceId: data.sourceId, origin: sourceOrigin(source), eventType: 'routing_changed',
      message: `Operator changed source network routing to ${data.mode === 'http_proxy' ? 'HTTP proxy (no direct fallback)' : 'direct'}. Cooldowns and request budgets unchanged.` })
    return summarize(row)
  })
}
