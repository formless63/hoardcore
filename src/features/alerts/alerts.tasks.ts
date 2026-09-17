import type { Task } from 'graphile-worker'
import { getDatabase } from '~/server/db/index.server'
import { deliverQueuedNtfyNotifications, queueAlertsForCollectionRun } from './alerts.server'

export interface AlertTaskPayload { runId: string; listingIds: string[] }
export interface AlertDeliveryTaskPayload { trigger?: 'collection' | 'retry' }

export function alertDeliveryJobOptions(runAt: Date) {
  return { jobKey: 'alerts.deliver', jobKeyMode: 'replace' as const, runAt, maxAttempts: 1 }
}

export async function scheduleNextAlertDelivery(nextDeliveryAt: Date | undefined, enqueue: (runAt: Date) => Promise<unknown>) {
  if (nextDeliveryAt) await enqueue(nextDeliveryAt)
}

/** Safe to enqueue after persistence: all failures stay isolated from catalog collection. */
export const evaluateCollectionAlertsTask: Task<'alerts.evaluate'> = async (payload: AlertTaskPayload, helpers) => {
  try {
    const result = await queueAlertsForCollectionRun(getDatabase(), payload)
    const delivery = await deliverQueuedNtfyNotifications(getDatabase())
    await scheduleNextAlertDelivery(delivery.nextDeliveryAt, (runAt) => helpers.addJob('alerts.deliver', { trigger: 'retry' }, alertDeliveryJobOptions(runAt)))
    helpers.logger.info(`alerts.evaluate: ${result.events} events, ${result.queued} queued, ${delivery.sent} sent`)
  } catch (error) {
    helpers.logger.error(`alerts.evaluate failed without affecting collection: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** A single keyed job wakes at the earliest in-process retry time. */
export const deliverAlertsTask: Task<'alerts.deliver'> = async (_payload: AlertDeliveryTaskPayload, helpers) => {
  try {
    const delivery = await deliverQueuedNtfyNotifications(getDatabase())
    await scheduleNextAlertDelivery(delivery.nextDeliveryAt, (runAt) => helpers.addJob('alerts.deliver', { trigger: 'retry' }, alertDeliveryJobOptions(runAt)))
    helpers.logger.info(`alerts.deliver: ${delivery.sent} sent`)
  } catch (error) {
    helpers.logger.error(`alerts.deliver failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
