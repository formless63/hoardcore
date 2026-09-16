import { definePlugin } from 'nitro'
import { closeDatabase } from '~/server/db/db.server'
import { startWorker, stopWorker } from './lifecycle.server'

/**
 * Nitro runs server plugins once per application instance. This keeps the
 * Graphile Worker in the same process/container as the HTTP application.
 */
export default definePlugin((nitroApp) => {
  // Defer one microtask so configuration/connection errors are captured by
  // Nitro instead of escaping synchronous plugin initialization.
  void Promise.resolve().then(startWorker).catch((error: unknown) => {
    nitroApp.captureError?.(error instanceof Error ? error : new Error(String(error)), {
      tags: ['worker', 'startup'],
    })
  })

  nitroApp.hooks.hook('close', async () => {
    await stopWorker()
    await closeDatabase()
  })
})
