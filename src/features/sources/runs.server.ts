import { asc, desc, eq } from 'drizzle-orm'
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

export async function listCollectionRunsFromDatabase(sourceId?: string) {
  const query = getDatabase().select().from(collectionRuns)
  const rows = sourceId ? await query.where(eq(collectionRuns.sourceId, sourceId)).orderBy(desc(collectionRuns.createdAt)) : await query.orderBy(desc(collectionRuns.createdAt))
  return { runs: rows }
}

export async function getCollectionRunFromDatabase(runId: string) {
  const db = getDatabase()
  const [row] = await db.select({ run: collectionRuns, sourceName: catalogSources.displayName })
    .from(collectionRuns)
    .innerJoin(catalogSources, eq(collectionRuns.sourceId, catalogSources.id))
    .where(eq(collectionRuns.id, runId))
  if (!row) throw new Error('Collection run not found')
  const events = await db.select().from(collectionRunEvents)
    .where(eq(collectionRunEvents.runId, runId)).orderBy(asc(collectionRunEvents.id))
  return { ...row, events }
}

export async function enqueueCatalogCollectionInDatabase(sourceId: string, requestLimit: number) {
  assertCatalogCollectionEnabled(getServerConfig().CATALOG_COLLECTION_ENABLED === 'true')
  let run: typeof collectionRuns.$inferSelect | undefined
  try {
    const insertedRuns = await getDatabase()
      .insert(collectionRuns)
      .values({ sourceId, status: 'queued', requestLimit })
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
  return run
}
