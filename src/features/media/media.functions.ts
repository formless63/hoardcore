import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'
import { requireSession } from '~/server/auth.server'
import { getServerConfig } from '~/server/config.server'
import { getDatabase } from '~/server/db/index.server'
import { catalogSources } from '~/server/db/schema/catalog-sources'
import { mediaCaptureRuns } from '~/server/db/schema/media'
import { createMediaCaptureRunSchema } from './media.schemas'
import { enqueueMediaCaptureBatch } from './media.server'
import { enqueueJob } from '~/server/worker/index.server'

export const getMediaCaptureAvailability = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession()
  return { enabled: getServerConfig().MEDIA_CAPTURE_ENABLED === 'true' }
})

/** Creates and queues one bounded media capture run after the deployment gate. */
export const requestMediaCaptureRun = createServerFn({ method: 'POST' })
  .validator(createMediaCaptureRunSchema)
  .handler(async ({ data }) => {
    await requireSession()
    if (getServerConfig().MEDIA_CAPTURE_ENABLED !== 'true') {
      throw new Error('Media capture is disabled by this deployment')
    }
    const db = getDatabase()
    const [source] = await db.select({ id: catalogSources.id }).from(catalogSources).where(eq(catalogSources.id, data.sourceId)).limit(1)
    if (!source) throw new Error('Source not found')
    try {
      const run = await enqueueMediaCaptureBatch(db, source.id, data.requestLimit, (runId) =>
        enqueueJob('media.capture', { runId }, { maxAttempts: 1, priority: 10 }))
      if (!run) throw new Error('A photo batch is already queued or running for this source')
      return run
    } catch (error) {
      if (error instanceof Error && error.message.includes('already queued')) throw error
      throw new Error('The media capture run could not be queued. Try again.')
    }
  })

export const listMediaCaptureRuns = createServerFn({ method: 'GET' })
  .validator(createMediaCaptureRunSchema.pick({ sourceId: true }))
  .handler(async ({ data }) => {
    await requireSession()
    return getDatabase().select().from(mediaCaptureRuns).where(eq(mediaCaptureRuns.sourceId, data.sourceId)).orderBy(desc(mediaCaptureRuns.createdAt)).limit(10)
  })
