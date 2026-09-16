import { desc, eq } from 'drizzle-orm'
import { getDatabase } from '~/server/db/index.server'
import { collectionRuns } from '~/server/db/schema'
import { enqueueJob } from '~/server/worker/index.server'

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

export async function enqueueCatalogCollectionInDatabase(sourceId: string) {
  let run: typeof collectionRuns.$inferSelect | undefined
  try {
    const insertedRuns = await getDatabase()
      .insert(collectionRuns)
      .values({ sourceId, status: 'queued' })
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
    await enqueueJob('catalog.collect', { sourceId, runId: run.id })
  } catch (error) {
    await getDatabase().update(collectionRuns).set({ status: 'failed', error: `Queue enqueue failed: ${error instanceof Error ? error.message : String(error)}`, completedAt: new Date() }).where(eq(collectionRuns.id, run.id))
    throw new Error('The collection could not be queued. Try again.')
  }
  return run
}
