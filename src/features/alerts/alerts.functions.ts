import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { notificationSettingsInputSchema } from './alerts.schemas'
import { z } from 'zod'
import { listAlertSubscriptionsFromDatabase, readNotificationSettingsFromDatabase, saveNotificationSettingsToDatabase, saveSavedViewAlertPreference as saveSavedViewAlertPreferenceInDatabase, saveWatchedListingAlertPreference } from './alerts.server'

const alertEventTypesSchema = z.array(z.enum(['new_match', 'price_change', 'availability_change'])).min(1).max(3).transform((types) => [...new Set(types)])

export const getNotificationSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return readNotificationSettingsFromDatabase(getDatabase(), session.user.id)
})

export const saveNotificationSettings = createServerFn({ method: 'POST' })
  .validator(notificationSettingsInputSchema)
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return saveNotificationSettingsToDatabase(getDatabase(), session.user.id, data)
  })

export const listAlertSubscriptions = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return listAlertSubscriptionsFromDatabase(getDatabase(), session.user.id)
})

export const saveWatchedAlertPreference = createServerFn({ method: 'POST' })
  .validator(z.object({ listingId: z.uuid(), enabled: z.boolean(), eventTypes: alertEventTypesSchema }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return saveWatchedListingAlertPreference(getDatabase(), session.user.id, data.listingId, data.enabled, data.eventTypes)
  })

export const saveSavedViewAlertPreference = createServerFn({ method: 'POST' })
  .validator(z.object({ savedViewId: z.uuid(), enabled: z.boolean(), eventTypes: alertEventTypesSchema }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return saveSavedViewAlertPreferenceInDatabase(getDatabase(), session.user.id, data.savedViewId, data.enabled, data.eventTypes)
  })
