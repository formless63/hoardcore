import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSession } from '~/server/auth.server'
import { manualCollectionRequestLimitSchema } from '~/features/sources/sources.schemas'
import { readOperatorSettingsFromDatabase, saveOperatorSettingsToDatabase } from './settings.server'

export const getOperatorSettings = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return readOperatorSettingsFromDatabase()
})

export const saveOperatorSettings = createServerFn({ method: 'POST' })
  .validator(z.object({ defaultCollectionRequestLimit: manualCollectionRequestLimitSchema }))
  .handler(async ({ data }) => {
    await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return saveOperatorSettingsToDatabase(data.defaultCollectionRequestLimit)
  })
