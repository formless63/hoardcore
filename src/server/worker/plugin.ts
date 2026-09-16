import { definePlugin } from 'nitro'
import { join } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { closeDatabase, getDatabase } from '~/server/db/db.server'
import { startWorker, stopWorker } from './lifecycle.server'

/**
 * Nitro runs server plugins once per application instance. This keeps the
 * Graphile Worker in the same process/container as the HTTP application.
 */
export default definePlugin((nitroApp) => {
  // Nitro plugins initialize synchronously. Keep readiness unavailable until
  // the regular app process has applied committed migrations and started its
  // embedded worker. A failed migration must terminate this instance.
  void Promise.resolve().then(async () => {
    await migrate(getDatabase(), { migrationsFolder: join(process.cwd(), 'drizzle') })
    await startWorker()
  }).catch((error: unknown) => {
    nitroApp.captureError?.(error instanceof Error ? error : new Error(String(error)), {
      tags: ['database', 'startup'],
    })
    process.exit(1)
  })

  nitroApp.hooks.hook('close', async () => {
    await stopWorker()
    await closeDatabase()
  })
})
