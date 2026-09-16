import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { listingFiltersSchema } from './listing-filters'
import { deleteListingViewFromDatabase, listSavedViewsFromDatabase, saveListingViewToDatabase } from './saved-views.server'

const savedViewNameSchema = z.string().trim().min(1).max(80)

export const listSavedListingViews = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return listSavedViewsFromDatabase(getDatabase(), session.user.id)
})

export const saveListingView = createServerFn({ method: 'POST' })
  .validator(z.object({ name: savedViewNameSchema, filters: listingFiltersSchema }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return saveListingViewToDatabase(getDatabase(), session.user.id, data.name, data.filters)
  })

export const deleteListingView = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return deleteListingViewFromDatabase(getDatabase(), session.user.id, data.id)
  })
