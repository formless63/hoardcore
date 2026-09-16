import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { listWatchedListingIds as listWatchedListingIdsFromDatabase, listWatchedListingsFromDatabase, setListingWatchedInDatabase } from './watchlist.server'

const listingIdSchema = z.uuid()

export const listWatchedListings = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return listWatchedListingsFromDatabase(getDatabase(), session.user.id)
})

export const listWatchedListingIds = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return listWatchedListingIdsFromDatabase(getDatabase(), session.user.id)
})

export const setListingWatched = createServerFn({ method: 'POST' })
  .validator(z.object({ listingId: listingIdSchema, watched: z.boolean() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return setListingWatchedInDatabase(getDatabase(), session.user.id, data.listingId, data.watched)
  })
