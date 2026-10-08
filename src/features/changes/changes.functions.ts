import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { changesSearchSchema } from './changes.schemas'
import { readChanges } from './changes.server'

export const getChanges = createServerFn({ method: 'GET' }).validator(changesSearchSchema).handler(async ({ data }) => {
  await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return readChanges(getDatabase(), data)
})
