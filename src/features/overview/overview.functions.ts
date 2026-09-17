import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { withRequiredSession } from '~/server/auth.server'
import { getOverviewFromDatabase } from './overview.server'

export const getOverview = createServerFn({ method: 'GET' })
  .validator(z.object({ days: z.union([z.literal(7), z.literal(30)]) }))
  .handler(async ({ data }) => withRequiredSession(async () => {
    setResponseHeader('Cache-Control', 'private, no-store')
    return getOverviewFromDatabase(data.days)
  }))
