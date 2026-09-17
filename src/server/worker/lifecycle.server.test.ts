import { describe, expect, it, vi } from 'vitest'
import { markUnexpectedRunnerExit, recoverInterruptedCollectionRuns } from './lifecycle.server'

describe('embedded worker lifecycle', () => {
  it('marks readiness failed and releases WorkerUtils when its runner exits', async () => {
    const runner = { promise: Promise.resolve(), stop: vi.fn(), kill: vi.fn() }
    const release = vi.fn().mockResolvedValue(undefined)
    const runtime = {
      runner,
      workerUtils: { release },
      status: { state: 'ready' as const },
    }

    markUnexpectedRunnerExit(runtime as never, runner as never, 'runner exited')

    expect(runtime.status).toEqual({ state: 'failed', error: 'runner exited' })
    expect(runtime.runner).toBeUndefined()
    expect(runtime.workerUtils).toBeUndefined()
    await Promise.resolve()
    expect(release).toHaveBeenCalledOnce()
  })

  it('does not downgrade a replacement worker when an old runner settles', () => {
    const oldRunner = { promise: Promise.resolve(), stop: vi.fn(), kill: vi.fn() }
    const replacement = { promise: Promise.resolve(), stop: vi.fn(), kill: vi.fn() }
    const release = vi.fn()
    const runtime = {
      runner: replacement,
      workerUtils: { release },
      status: { state: 'ready' as const },
    }

    markUnexpectedRunnerExit(runtime as never, oldRunner as never, 'old runner exited')

    expect(runtime.status).toEqual({ state: 'ready' })
    expect(release).not.toHaveBeenCalled()
  })

  it('fails interrupted running collection runs and retires their durable jobs at startup', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'f08a1193-1f17-4c9d-9fc6-9d4706afc1a4' }, { id: '4ae76b7d-784e-4796-883b-1e17788b8ac0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const permanentlyFailJobs = vi.fn().mockResolvedValue([])

    const recovered = await recoverInterruptedCollectionRuns({ query } as never, { permanentlyFailJobs } as never)

    expect(recovered).toBe(2)
    expect(query.mock.calls[0]?.[0]).toContain("status = 'running'")
    expect(permanentlyFailJobs).toHaveBeenCalledWith(['job-1'], expect.stringContaining('not retried automatically'))
    expect(query).toHaveBeenCalledTimes(4)
    expect(query.mock.calls[2]?.[1]).toEqual([
      expect.stringContaining('Collection interrupted by an application restart'),
      ['f08a1193-1f17-4c9d-9fc6-9d4706afc1a4', '4ae76b7d-784e-4796-883b-1e17788b8ac0'],
    ])
  })

  it('does not touch Graphile jobs when there are no active collection runs', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const permanentlyFailJobs = vi.fn()

    await expect(recoverInterruptedCollectionRuns({ query } as never, { permanentlyFailJobs } as never)).resolves.toBe(0)

    expect(query).toHaveBeenCalledOnce()
    expect(permanentlyFailJobs).not.toHaveBeenCalled()
  })
})
