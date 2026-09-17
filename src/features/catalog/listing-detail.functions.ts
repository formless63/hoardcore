import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { getCatalogListingDetail, getCatalogListingEvidencePayload, getCatalogListingObservations } from '~/server/db/catalog-detail.server'

export const getListingDetail = createServerFn({ method: 'GET' }).validator(z.object({ listingId: z.uuid() })).handler(async ({ data }) => {
  await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return getCatalogListingDetail(getDatabase(), data.listingId)
})

export const getListingEvidencePayload = createServerFn({ method: 'GET' }).validator(z.object({ listingId: z.uuid(), evidenceId: z.uuid() })).handler(async ({ data }) => {
  await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return getCatalogListingEvidencePayload(getDatabase(), data.listingId, data.evidenceId)
})

export const getListingObservationPage = createServerFn({ method: 'GET' })
  .validator(z.object({ listingId: z.uuid(), before: z.object({ observedAt: z.iso.datetime({ offset: true }), id: z.uuid() }) }))
  .handler(async ({ data }) => {
    await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return getCatalogListingObservations(getDatabase(), data.listingId, { observedAt: new Date(data.before.observedAt), id: data.before.id })
  })
