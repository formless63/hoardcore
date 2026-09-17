import { and, asc, desc, eq, getTableColumns, gt } from 'drizzle-orm'
import { getDatabase } from '~/server/db/index.server'
import { catalogSources, collectionRunEvents, collectionRuns } from '~/server/db/schema'
import { enqueueJob } from '~/server/worker/index.server'
import { getServerConfig } from '~/server/config.server'
import { assertCatalogCollectionEnabled } from './collection-gate'

function hasPostgresCode(error: unknown, code: string): boolean {
  let current = error
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== 'object' || current === null) return false
    if ('code' in current && current.code === code) return true
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}

const { evidencePages: _checkpointEvidence, ...publicRunColumns } = getTableColumns(collectionRuns)

export async function listCollectionRunsFromDatabase(sourceId?: string) {
  const query = getDatabase().select(publicRunColumns).from(collectionRuns)
  const rows = sourceId ? await query.where(eq(collectionRuns.sourceId, sourceId)).orderBy(desc(collectionRuns.createdAt)) : await query.orderBy(desc(collectionRuns.createdAt))
  return { runs: rows }
}

function publicRun(run: typeof collectionRuns.$inferSelect) {
  const { evidencePages: _evidencePages, ...visible } = run
  return visible
}

export async function getCollectionRunFromDatabase(runId: string) {
  const db = getDatabase()
  const [row] = await db.select({ run: publicRunColumns, sourceName: catalogSources.displayName })
    .from(collectionRuns)
    .innerJoin(catalogSources, eq(collectionRuns.sourceId, catalogSources.id))
    .where(eq(collectionRuns.id, runId))
  if (!row) throw new Error('Collection run not found')
  const events = await db.select().from(collectionRunEvents)
    .where(eq(collectionRunEvents.runId, runId)).orderBy(asc(collectionRunEvents.id))
  return { ...row, events }
}

export async function enqueueCatalogCollectionInDatabase(sourceId: string, requestLimit: number, interPageWaitMs = 0) {
  assertCatalogCollectionEnabled(getServerConfig().CATALOG_COLLECTION_ENABLED === 'true')
  const [source] = await getDatabase().select({ collectionEnabled: catalogSources.collectionEnabled }).from(catalogSources).where(eq(catalogSources.id, sourceId))
  if (!source) throw new Error('That catalog source is no longer available')
  if (!source.collectionEnabled) throw new Error('Collection is paused for this source')
  let run: typeof collectionRuns.$inferSelect | undefined
  try {
    const insertedRuns = await getDatabase()
      .insert(collectionRuns)
      .values({ sourceId, status: 'queued', requestLimit, interPageWaitMs })
      .returning()
    run = insertedRuns[0]
  } catch (error) {
    if (hasPostgresCode(error, '23505')) {
      throw new Error('A collection is already queued or running for this source')
    }
    if (hasPostgresCode(error, '23503')) {
      throw new Error('That catalog source is no longer available')
    }
    throw error
  }
  if (!run) throw new Error('The collection run could not be created')
  try {
    await getDatabase().insert(collectionRunEvents).values({ runId: run.id, message: `Queued with a ceiling of ${requestLimit} requests.` })
    // A process restart must not silently repeat source traffic. Operators
    // decide when an interrupted collection is safe to run again.
    await enqueueJob('catalog.collect', { sourceId, runId: run.id }, { maxAttempts: 1 })
  } catch (error) {
    await getDatabase().update(collectionRuns).set({ status: 'failed', error: `Queue enqueue failed: ${error instanceof Error ? error.message : String(error)}`, completedAt: new Date() }).where(eq(collectionRuns.id, run.id))
    throw new Error('The collection could not be queued. Try again.')
  }
  return publicRun(run)
}

/** Only discretionary deferrals can be shortened; source pacing and Retry-After are immutable gates. */
export async function continueDeferredCollectionInDatabase(runId: string) {
  assertCatalogCollectionEnabled(getServerConfig().CATALOG_COLLECTION_ENABLED === 'true')
  const db = getDatabase()
  const now = new Date()
  const [run] = await db.select().from(collectionRuns).where(eq(collectionRuns.id, runId))
  if (!run || run.status !== 'queued' || !run.nextAllowedAt) throw new Error('This collection is not waiting for continuation')
  const [source] = await db.select({ collectionEnabled: catalogSources.collectionEnabled }).from(catalogSources).where(eq(catalogSources.id, run.sourceId))
  if (!source?.collectionEnabled) throw new Error('Collection is paused for this source')
  const hardGate = Math.max(run.minimumAllowedAt?.getTime() ?? 0, run.retryAfterUntil?.getTime() ?? 0, now.getTime())
  if (run.nextAllowedAt.getTime() <= hardGate) throw new Error('This wait is required by minimum pacing or the source Retry-After and cannot be shortened')
  const runAt = new Date(hardGate)
  const [updated] = await db.update(collectionRuns).set({ nextAllowedAt: runAt, error: `Operator requested continuation at ${runAt.toISOString()}.` })
    .where(and(eq(collectionRuns.id, runId), eq(collectionRuns.status, 'queued'), eq(collectionRuns.nextAllowedAt, run.nextAllowedAt), gt(collectionRuns.nextAllowedAt, runAt))).returning()
  if (!updated) throw new Error('Collection wait changed; refresh and try again')
  try {
    await enqueueJob('catalog.collect', { sourceId: run.sourceId, runId }, { runAt, maxAttempts: 1, jobKey: `catalog-continue-${runId}` })
    await db.insert(collectionRunEvents).values({ runId, message: `Operator shortened a discretionary wait to ${runAt.toISOString()}; required source delays remain in force.` })
  } catch (error) {
    await db.update(collectionRuns).set({ nextAllowedAt: run.nextAllowedAt, error: run.error }).where(and(eq(collectionRuns.id, runId), eq(collectionRuns.status, 'queued')))
    throw error
  }
  return publicRun(updated)
}
