import { Cron } from 'croner'
import cronstrue from 'cronstrue'

export const DEFAULT_SCHEDULE_TIME_ZONE = 'UTC'
export const EXAMPLE_SCHEDULE_CRON = '0 9,21 * * *'
export const MINIMUM_SCHEDULE_INTERVAL_MS = 6 * 60 * 60 * 1000

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export function nextCronRun(expression: string, timeZone: string, after: Date = new Date()): Date {
  const next = new Cron(expression, { timezone: timeZone, mode: '5-part' }).nextRun(after)
  if (!next) throw new Error('Cron expression has no future run')
  return next
}

export function validateCollectionCron(expression: string, timeZone: string): string | null {
  if (!isValidTimeZone(timeZone)) return 'Use a valid IANA timezone such as America/New_York.'
  try {
    const runs = new Cron(expression, { timezone: timeZone, mode: '5-part' }).nextRuns(8)
    if (runs.length < 2) return 'Cron expression must produce recurring runs.'
    if (runs.some((run, index) => index > 0 && run.getTime() - runs[index - 1]!.getTime() < MINIMUM_SCHEDULE_INTERVAL_MS)) {
      return 'Scheduled collections must be at least six hours apart.'
    }
    return null
  } catch {
    return 'Use a valid five-field cron expression.'
  }
}

export function describeCron(expression: string, timeZone: string): string {
  const error = validateCollectionCron(expression, timeZone)
  if (error) return error
  try {
    return `${cronstrue.toString(expression, { use24HourTimeFormat: false })} (${timeZone})`
  } catch {
    return 'Use a valid five-field cron expression.'
  }
}

export function formatScheduledDate(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short',
  }).format(new Date(value))
}
