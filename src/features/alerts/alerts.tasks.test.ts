import { describe, expect, it } from 'vitest'
import { alertDeliveryJobOptions, scheduleNextAlertDelivery } from './alerts.tasks'

describe('alert delivery scheduling', () => {
  it('schedules the next durable retry at its requested wakeup time', async () => {
    const retryAt = new Date('2026-09-17T05:30:00.000Z')
    const scheduled: Date[] = []

    await scheduleNextAlertDelivery(retryAt, async (runAt) => {
      scheduled.push(runAt)
    })

    expect(scheduled).toEqual([retryAt])
    expect(alertDeliveryJobOptions(retryAt)).toEqual({ jobKey: 'alerts.deliver', jobKeyMode: 'replace', runAt: retryAt, maxAttempts: 1 })
  })

  it('does not enqueue work when the queue is empty', async () => {
    let enqueued = false
    await scheduleNextAlertDelivery(undefined, async () => { enqueued = true })
    expect(enqueued).toBe(false)
  })
})
