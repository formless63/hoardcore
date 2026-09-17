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
  cleanup?: Promise<void>
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
  // If a previous runner exited unexpectedly, wait until its WorkerUtils has
  // released its resources before creating another runner. This prevents
  // overlapping embedded worker instances in the same application process.
  runtime.startup = (runtime.cleanup ?? Promise.resolve()).then(() => startWorkerInternal(runtime, getPostgresPool())).catch((error: unknown) => {
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
  await recoverInterruptedCollectionRuns(pool, runtime.workerUtils)
  runtime.runner = await run({
    pgPool: pool,
    taskList: taskRegistry,
    crontab: catalogScheduleCrontab,
    concurrency: 1,
    noHandleSignals: true,
  })
  monitorRunner(runtime, runtime.runner)
  runtime.status = { state: 'ready' }
}

const interruptedRunMessage = 'Collection interrupted by an application restart before completion; it was not retried automatically.'
const interruptedJobMessage = 'Collection run was interrupted by an application restart and was not retried automatically.'

/**
 * A source request should never resume merely because the application process
 * restarted. Recover genuinely running records first so the operator can
 * explicitly decide whether to run again, and retire any matching durable jobs
 * that have not begun. Queued records deliberately survive: they may be a
 * source-authorized Retry-After deferral with a future run time. The collection
 * task also validates this terminal state before it makes an outbound request,
 * covering an old locked job that cannot be retired by WorkerUtils at this
 * instant.
 */
export async function recoverInterruptedCollectionRuns(
  pool: Pick<Pool, 'query'>,
  workerUtils: Pick<WorkerUtils, 'permanentlyFailJobs'>,
): Promise<number> {
  const active = await pool.query<{ id: string }>(`
    select id::text as id
    from collection_runs
    where status = 'running'
  `)
  const runIds = active.rows.map((row) => row.id)
  if (!runIds.length) return 0

  // Do this before changing run state. If the process stops in between, the
  // next startup still sees active runs and completes the same conservative
  // recovery rather than allowing a source request through.
  const jobs = await pool.query<{ id: string }>(`
    select id::text as id
    from graphile_worker.jobs
    where task_identifier = $1
      and payload ->> 'runId' = any($2::text[])
  `, ['catalog.collect', runIds])
  if (jobs.rows.length) {
    await workerUtils.permanentlyFailJobs(jobs.rows.map((job) => job.id), interruptedJobMessage)
  }

  await pool.query(`
    update collection_runs
    set status = 'failed',
        error = $1,
        completed_at = now()
    where id = any($2::uuid[])
      and status = 'running'
  `, [interruptedRunMessage, runIds])
  await pool.query(`
    insert into collection_run_events (run_id, message)
    select unnest($1::uuid[]), $2
  `, [runIds, interruptedRunMessage])
  return runIds.length
}

function monitorRunner(runtime: WorkerRuntimeState, runner: Runner): void {
  void runner.promise.then(
    () => markUnexpectedRunnerExit(runtime, runner, 'Embedded worker runner stopped unexpectedly.'),
    (error: unknown) => markUnexpectedRunnerExit(runtime, runner, error instanceof Error ? error.message : String(error)),
  )
}

/** Exported for a synthetic lifecycle test; normal callers use monitorRunner. */
export function markUnexpectedRunnerExit(runtime: WorkerRuntimeState, runner: Runner, reason: string): void {
  // stopWorker deliberately changes status before asking Graphile to stop. A
  // stale runner from an earlier start must likewise never downgrade a healthy
  // replacement runner.
  if (runtime.runner !== runner || runtime.status.state === 'stopping' || runtime.status.state === 'stopped') return

  runtime.runner = undefined
  runtime.startup = undefined
  runtime.status = { state: 'failed', error: reason }
  const workerUtils = runtime.workerUtils
  runtime.workerUtils = undefined
  if (!workerUtils) return

  const cleanup = Promise.resolve(workerUtils.release()).catch((error: unknown) => {
    // Preserve the original runner failure as the readiness reason while
    // ensuring the release failure is still visible to the application logs.
    console.error('Could not release WorkerUtils after embedded worker exit', error)
  }).finally(() => {
    if (runtime.cleanup === cleanup) runtime.cleanup = undefined
  })
  runtime.cleanup = cleanup
}

export const catalogScheduleCrontab = '* * * * * catalog_schedule ?id=hoardcore-source-schedule'

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
