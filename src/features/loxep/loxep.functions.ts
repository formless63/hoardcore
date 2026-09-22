import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { createLoxepConnection, listLoxepConnections, publishOpportunityToLoxep, revokeLoxepConnection } from './loxep.server'

const connectionId = z.uuid()
const createConnectionInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  baseUrl: z.url(),
  remoteConnectionId: z.uuid(),
  ingestToken: z.string().trim().min(20),
})

export const listLoxepConnectionsForCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return listLoxepConnections(getDatabase(), session.user.id)
})

export const createCurrentUserLoxepConnection = createServerFn({ method: 'POST' }).validator(createConnectionInput).handler(async ({ data }) => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return createLoxepConnection(getDatabase(), session.user.id, data)
})

export const revokeCurrentUserLoxepConnection = createServerFn({ method: 'POST' }).validator(z.object({ connectionId })).handler(async ({ data }) => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return revokeLoxepConnection(getDatabase(), session.user.id, data.connectionId)
})

export const publishOpportunityToCurrentUserLoxep = createServerFn({ method: 'POST' }).validator(z.object({ listingId: z.uuid(), connectionId })).handler(async ({ data }) => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return publishOpportunityToLoxep(getDatabase(), session.user.id, data)
})
