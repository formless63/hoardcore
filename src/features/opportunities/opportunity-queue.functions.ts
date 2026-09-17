import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { listOpportunityQueue } from './opportunity-queue.server'
export const getOpportunityQueue = createServerFn({ method: 'GET' }).handler(async () => { const session = await requireSession(); setResponseHeader('Cache-Control', 'private, no-store'); return listOpportunityQueue(getDatabase(), session.user.id) })
