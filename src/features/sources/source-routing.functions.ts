import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { sourceRoutingInputSchema } from './source-routing.schemas'
import { readSourceRouting, saveSourceRoutingInDatabase } from './source-routing.server'

export const getSourceRouting = createServerFn({ method: 'GET' }).validator(z.object({ sourceId: z.uuid() })).handler(async ({ data }) => {
  await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return readSourceRouting(getDatabase(), data.sourceId)
})
export const saveSourceRouting = createServerFn({ method: 'POST' }).validator(sourceRoutingInputSchema).handler(async ({ data }) => {
  await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return saveSourceRoutingInDatabase(getDatabase(), data)
})
