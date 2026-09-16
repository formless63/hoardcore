import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { importResearchResult, createResearchApiToken, listResearchApiTokens, listResearchComparables, listResearchHistory, revokeResearchApiToken, saveResearchBatch, summarizeResearchForListings } from './research.server'
import { parseResearchPacket } from './research.schemas'
import { renderResearchPrompt } from './research.batch'
import { previewResearchResult } from './research.preview'

const tokenName = z.string().trim().min(1).max(80)

export const previewPastedResearch = createServerFn({ method: 'POST' })
  .validator(z.object({ packet: z.unknown(), resultJson: z.string().min(1).max(5_000_000) }))
  .handler(async ({ data }) => {
    await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return previewResearchResult(data.resultJson, parseResearchPacket(data.packet))
  })

export const importPastedResearch = createServerFn({ method: 'POST' })
  .validator(z.object({ resultJson: z.string().min(1).max(5_000_000) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return importResearchResult(getDatabase(), session.user.id, data.resultJson)
  })

/** Saves an exported packet before it is handed to an outside researcher. */
export const saveResearchPacket = createServerFn({ method: 'POST' })
  .validator(z.object({ packet: z.unknown() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    const packet = parseResearchPacket(data.packet)
    const packetJson = JSON.stringify(packet, null, 2)
    setResponseHeader('Cache-Control', 'private, no-store')
    return saveResearchBatch(getDatabase(), session.user.id, packet, renderResearchPrompt(packet, packetJson))
  })

export const listResearchAgentTokens = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return listResearchApiTokens(getDatabase(), session.user.id)
})

export const createResearchAgentToken = createServerFn({ method: 'POST' })
  .validator(z.object({ name: tokenName, expiresAt: z.iso.datetime({ offset: true }).optional() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return createResearchApiToken(getDatabase(), session.user.id, data.name, data.expiresAt ? new Date(data.expiresAt) : undefined)
  })

export const revokeResearchAgentToken = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return revokeResearchApiToken(getDatabase(), session.user.id, data.id)
  })

export const listListingResearchComparables = createServerFn({ method: 'GET' })
  .validator(z.object({ listingId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return listResearchComparables(getDatabase(), session.user.id, data.listingId)
  })

export const listListingResearchHistory = createServerFn({ method: 'GET' })
  .validator(z.object({ listingId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    const history = await listResearchHistory(getDatabase(), session.user.id, data.listingId)
    // JSONB is durable JSON, but server functions require an explicitly
    // serializable value rather than `unknown` at this boundary.
    return history.map((item) => ({ ...item, normalizedPayload: JSON.stringify(item.normalizedPayload ?? null) }))
  })

/** Batched catalog-list enrichment; every value is scoped to the current user. */
export const listResearchSummariesForListings = createServerFn({ method: 'POST' })
  .validator(z.object({ listingIds: z.array(z.uuid()).min(1).max(5_000) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return summarizeResearchForListings(getDatabase(), session.user.id, data.listingIds)
  })
