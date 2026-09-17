import {
  makeWorkerUtils,
  run,
  type Job,
  type Runner,
  type TaskSpec,
  type WorkerUtils,
} from 'graphile-worker'
import type { Pool } from 'pg'
import { getPostgresPool } from '~/server/db/pool.server'
import { taskRegistry } from './tasks'

export type WorkerReadiness = 'stopped' | 'starting' | 'ready' | 'stopping' | 'failed'

export interface WorkerStatus {
  state: WorkerReadiness
  error?: string
}

interface WorkerRuntimeState {
  workerUtils?: WorkerUtils
  runner?: Runner
  startup?: Promise<void>
  shutdown?: Promise<void>
  status: WorkerStatus
}

type WorkerGlobal = typeof globalThis & {
  __hoardcoreWorkerRuntime__?: WorkerRuntimeState
}

/**
 * Nitro may bundle this module into more than one server chunk. Process-global
 * state ensures routes, enqueue calls, and the startup plugin all observe the
 * same embedded runner rather than starting independent workers.
 */
function getRuntime(): WorkerRuntimeState {
  const workerGlobal = globalThis as WorkerGlobal
  workerGlobal.__hoardcoreWorkerRuntime__ ??= { status: { state: 'stopped' } }
  return workerGlobal.__hoardcoreWorkerRuntime__
}

export function getWorkerStatus(): WorkerStatus {
  return { ...getRuntime().status }
}

/** Starts the embedded worker at most once for the lifetime of this process. */
export function startWorker(): Promise<void> {
  const runtime = getRuntime()
  if (runtime.startup) return runtime.startup
  if (runtime.status.state === 'ready') return Promise.resolve()

  runtime.status = { state: 'starting' }
  runtime.startup = startWorkerInternal(runtime, getPostgresPool()).catch((error: unknown) => {
    runtime.status = { state: 'failed', error: error instanceof Error ? error.message : String(error) }
    runtime.startup = undefined
    throw error
  })
  return runtime.startup
}

async function startWorkerInternal(runtime: WorkerRuntimeState, pool: Pool): Promise<void> {
  // WorkerUtils is shared with enqueue calls; using the application pool avoids a
  // second pool/service while keeping queue operations durable in PostgreSQL.
  runtime.workerUtils = await makeWorkerUtils({ pgPool: pool })
  await runtime.workerUtils.migrate()
  runtime.runner = await run({
    pgPool: pool,
    taskList: taskRegistry,
    crontab: '* * * * * catalog.schedule ?id=hoardcore-source-schedule',
    concurrency: 1,
    noHandleSignals: true,
  })
  runtime.status = { state: 'ready' }
}

export async function enqueueJob<TName extends keyof GraphileWorker.Tasks>(
  name: TName,
  payload: GraphileWorker.Tasks[TName],
  spec?: TaskSpec,
): Promise<Job> {
  await startWorker()
  const runtime = getRuntime()
  if (!runtime.workerUtils) throw new Error('Worker is not available')
  return runtime.workerUtils.addJob(name, payload as never, spec)
}

/** Stops the runner and releases WorkerUtils before the database pool is closed. */
export function stopWorker(): Promise<void> {
  const runtime = getRuntime()
  if (runtime.shutdown) return runtime.shutdown
  if (!runtime.runner && !runtime.workerUtils && !runtime.startup) {
    runtime.status = { state: 'stopped' }
    return Promise.resolve()
  }

  runtime.status = { state: 'stopping' }
  runtime.shutdown = (async () => {
    try {
      // A signal can arrive during migration/startup. Wait for that phase so
      // WorkerUtils is never released while it is still being initialized.
      await runtime.startup?.catch(() => undefined)
      await runtime.runner?.stop('application shutdown')
      await runtime.workerUtils?.release()
      runtime.runner = undefined
      runtime.workerUtils = undefined
      runtime.startup = undefined
      runtime.status = { state: 'stopped' }
    } finally {
      runtime.shutdown = undefined
    }
  })()
  return runtime.shutdown
}
