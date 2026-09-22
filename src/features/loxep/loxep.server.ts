import { and, desc, eq, inArray } from 'drizzle-orm'
import { createHash, randomUUID } from 'node:crypto'
import type { Database } from '~/server/db/db.server'
import { getServerConfig } from '~/server/config.server'
import { catalogProducts, catalogSources, researchBatches, researchComparables, researchSubmissions, sourceListingCurrent, sourceListings, listingDecisions, opportunityAssumptions, loxepConnections, loxepDeliveries, loxepOutcomeEvents } from '~/server/db/schema'
import { enqueueJob } from '~/server/worker/index.server'
import { indexOpportunityResearchSignals } from '~/features/opportunities/opportunity-queue.server'
import { calculationForInputs } from '~/features/opportunities/opportunity-queue'
import { opportunityInputsSchema } from '~/features/opportunities/opportunity.schemas'
import { parseResearchResult } from '~/features/research/research.schemas'
import { decryptLoxepToken, encryptLoxepToken, hashLoxepToken, tokenPrefix } from './loxep-crypto.server'
import { loxepOpportunityEventSchema, loxepOutcomeEventSchema, type LoxepOpportunityEvent } from './loxep.schemas'

const allowedDecisionStates = new Set(['buy', 'buy_candidate'])
const decimal = (value: number | null | undefined): string | null => value === null || value === undefined ? null : value.toFixed(2)

export class LoxepOutcomeConflictError extends Error {
  override name = 'LoxepOutcomeConflictError'
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Loxep URL must use HTTP or HTTPS')
  if (url.username || url.password || url.search || url.hash) throw new Error('Loxep URL must not contain credentials, a query, or a fragment')
  return url.toString().replace(/\/$/u, '')
}

export type LoxepConnectionSummary = {
  id: string
  name: string
  baseUrl: string
  remoteConnectionId: string
  status: 'active' | 'disabled' | 'revoked'
  callbackTokenPrefix: string
  createdAt: Date
  updatedAt: Date
  lastDelivery: { status: 'pending' | 'accepted' | 'failed'; updatedAt: Date; lastError: string | null } | null
}

export async function listLoxepConnections(db: Database, userId: string): Promise<LoxepConnectionSummary[]> {
  const connections = await db.select({
    id: loxepConnections.id,
    name: loxepConnections.name,
    baseUrl: loxepConnections.baseUrl,
    remoteConnectionId: loxepConnections.remoteConnectionId,
    status: loxepConnections.status,
    callbackTokenPrefix: loxepConnections.callbackTokenPrefix,
    createdAt: loxepConnections.createdAt,
    updatedAt: loxepConnections.updatedAt,
  }).from(loxepConnections).where(eq(loxepConnections.userId, userId)).orderBy(desc(loxepConnections.createdAt))
  if (!connections.length) return []
  const deliveries = await db.select({
    connectionId: loxepDeliveries.connectionId,
    status: loxepDeliveries.status,
    updatedAt: loxepDeliveries.updatedAt,
    lastError: loxepDeliveries.lastError,
  }).from(loxepDeliveries).where(inArray(loxepDeliveries.connectionId, connections.map((connection) => connection.id))).orderBy(desc(loxepDeliveries.updatedAt))
  const latestByConnection = new Map<string, (typeof deliveries)[number]>()
  for (const delivery of deliveries) if (!latestByConnection.has(delivery.connectionId)) latestByConnection.set(delivery.connectionId, delivery)
  return connections.map((connection) => {
    const lastDelivery = latestByConnection.get(connection.id)
    return { ...connection, lastDelivery: lastDelivery ? { status: lastDelivery.status, updatedAt: lastDelivery.updatedAt, lastError: lastDelivery.lastError } : null }
  })
}

export async function createLoxepConnection(db: Database, userId: string, input: { name: string; baseUrl: string; remoteConnectionId: string; ingestToken: string }) {
  const name = input.name.trim()
  if (!name) throw new Error('Connection name is required')
  if (name.length > 120) throw new Error('Connection name is too long')
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  if (!/^\S{20,}$/u.test(input.ingestToken)) throw new Error('Loxep ingest token is required')
  const callbackToken = `hc_hook_${randomUUID().replaceAll('-', '')}_${Buffer.from(randomUUID()).toString('base64url')}`
  const encrypted = encryptLoxepToken(input.ingestToken)
  const [connection] = await db.insert(loxepConnections).values({
    userId,
    name,
    baseUrl,
    remoteConnectionId: input.remoteConnectionId,
    tokenCiphertext: encrypted.ciphertext,
    tokenNonce: encrypted.nonce,
    tokenAuthTag: encrypted.authTag,
    callbackTokenHash: hashLoxepToken(callbackToken),
    callbackTokenPrefix: tokenPrefix(callbackToken),
  }).returning({ id: loxepConnections.id })
  if (!connection) throw new Error('Could not create Loxep connection')
  return {
    connectionId: connection.id,
    callbackToken,
    callbackPath: `/api/v1/hooks/loxep/${connection.id}`,
  }
}

export async function revokeLoxepConnection(db: Database, userId: string, connectionId: string) {
  const result = await db.update(loxepConnections).set({ status: 'revoked', updatedAt: new Date() }).where(and(eq(loxepConnections.id, connectionId), eq(loxepConnections.userId, userId))).returning({ id: loxepConnections.id })
  if (!result.length) throw new Error('Loxep connection was not found')
  return { revoked: true }
}

async function buildOpportunityPayload(db: Database, userId: string, listingId: string, eventId: string): Promise<LoxepOpportunityEvent> {
  const [listing] = await db.select({
    id: sourceListings.id,
    listingKey: sourceListings.listingKey,
    url: sourceListings.url,
    title: sourceListingCurrent.title,
    price: sourceListingCurrent.price,
    currency: sourceListingCurrent.currency,
    available: sourceListingCurrent.available,
    stockQuantity: sourceListingCurrent.stockQuantity,
    observedAt: sourceListingCurrent.observedAt,
    sourceKey: catalogSources.sourceKey,
    moduleId: catalogSources.moduleId,
    productTitle: catalogProducts.title,
  }).from(sourceListings)
    .innerJoin(sourceListingCurrent, eq(sourceListingCurrent.listingId, sourceListings.id))
    .innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
    .where(eq(sourceListings.id, listingId)).limit(1)
  if (!listing) throw new Error('Listing was not found or has no current observation')

  const [decision] = await db.select({ state: listingDecisions.state }).from(listingDecisions).where(and(eq(listingDecisions.userId, userId), eq(listingDecisions.listingId, listingId))).limit(1)
  if (!decision || !allowedDecisionStates.has(decision.state)) throw new Error('Only Buy decisions can be published to Loxep')

  const [assumption] = await db.select({ currency: opportunityAssumptions.currency, inputs: opportunityAssumptions.inputs }).from(opportunityAssumptions).where(and(eq(opportunityAssumptions.userId, userId), eq(opportunityAssumptions.listingId, listingId))).limit(1)
  const inputs = assumption ? opportunityInputsSchema.safeParse(assumption.inputs).data : undefined
  const calculation = calculationForInputs(inputs)

  const submissions = await db.select({ id: researchSubmissions.id, normalizedPayload: researchSubmissions.normalizedPayload }).from(researchSubmissions)
    .innerJoin(researchBatches, eq(researchBatches.id, researchSubmissions.batchId))
    .where(and(eq(researchBatches.createdByUserId, userId), eq(researchSubmissions.status, 'valid')))
  const relevantSubmissions = submissions.filter((submission) => {
    try {
      return parseResearchResult(submission.normalizedPayload).records.some((record) => record.reference.entityType === 'source_listing' && record.reference.hoardcoreId === listingId)
    } catch { return false }
  })
  const signals = indexOpportunityResearchSignals(relevantSubmissions.map((submission) => submission.normalizedPayload).filter(Boolean)).get(listingId) ?? { confidence: null, demand: null, liquidity: null, risk: null }
  const comparables = relevantSubmissions.length === 0 ? [] : await db.select({
    channel: researchComparables.channel,
    evidenceType: researchComparables.evidenceType,
    price: researchComparables.price,
    shipping: researchComparables.shipping,
    currency: researchComparables.currency,
    condition: researchComparables.condition,
    observedAt: researchComparables.observedAt,
    soldAt: researchComparables.soldAt,
    url: researchComparables.url,
    notes: researchComparables.notes,
  }).from(researchComparables).where(and(eq(researchComparables.sourceListingId, listingId), inArray(researchComparables.submissionId, relevantSubmissions.map((submission) => submission.id)))).orderBy(desc(researchComparables.createdAt)).limit(50)

  return loxepOpportunityEventSchema.parse({
    schema: 'hoardcore.loxep.opportunity.v1',
    eventId,
    occurredAt: new Date().toISOString(),
    source: { moduleId: listing.moduleId, sourceKey: listing.sourceKey, listingId: listing.id, listingKey: listing.listingKey, url: listing.url },
    listing: { title: listing.title || listing.productTitle, price: listing.price, currency: listing.currency, available: listing.available, stockQuantity: listing.stockQuantity, observedAt: listing.observedAt.toISOString() },
    opportunity: {
      decision: decision.state,
      profit: calculation?.status === 'complete' ? decimal(calculation.profit) : null,
      roiPercent: calculation?.status === 'complete' ? calculation.roiPercent : null,
      targetPrice: inputs?.estimatedMarketValue.value === null || inputs?.estimatedMarketValue.value === undefined ? null : decimal(inputs.estimatedMarketValue.value),
      currency: assumption?.currency ?? listing.currency,
    },
    research: {
      submissionIds: relevantSubmissions.map((submission) => submission.id),
      confidence: signals.confidence,
      demand: signals.demand,
      liquidity: signals.liquidity,
      risk: signals.risk,
      comparables: comparables.map((comparable) => ({ ...comparable, price: comparable.price, shipping: comparable.shipping, observedAt: comparable.observedAt?.toISOString() ?? null, soldAt: comparable.soldAt?.toISOString() ?? null })),
    },
  })
}

export async function publishOpportunityToLoxep(db: Database, userId: string, input: { listingId: string; connectionId: string }) {
  const [connection] = await db.select().from(loxepConnections).where(and(eq(loxepConnections.id, input.connectionId), eq(loxepConnections.userId, userId))).limit(1)
  if (!connection || connection.status !== 'active') throw new Error('Active Loxep connection was not found')
  const eventId = randomUUID()
  const payload = await buildOpportunityPayload(db, userId, input.listingId, eventId)
  const [delivery] = await db.insert(loxepDeliveries).values({ connectionId: connection.id, userId, listingId: input.listingId, eventId, payload, status: 'pending', attempts: 0, lastError: null, lastResponseStatus: null, remoteMarketplaceItemId: null, updatedAt: new Date() }).onConflictDoUpdate({
    target: [loxepDeliveries.connectionId, loxepDeliveries.listingId],
    set: { eventId, payload, status: 'pending', attempts: 0, lastAttemptAt: null, lastResponseStatus: null, remoteMarketplaceItemId: null, lastError: null, updatedAt: new Date() },
  }).returning({ id: loxepDeliveries.id, eventId: loxepDeliveries.eventId })
  if (!delivery) throw new Error('Could not queue the Loxep publish')
  await enqueueJob('loxep.publish-opportunity', { deliveryId: delivery.id }, { maxAttempts: 5, jobKey: `loxep-publish:${delivery.id}`, jobKeyMode: 'replace' })
  return { deliveryId: delivery.id, eventId: delivery.eventId, status: 'pending' as const }
}

export async function deliverLoxepOpportunity(db: Database, deliveryId: string, fetcher: typeof fetch = fetch): Promise<void> {
  const [row] = await db.select({ delivery: loxepDeliveries, connection: loxepConnections }).from(loxepDeliveries).innerJoin(loxepConnections, eq(loxepConnections.id, loxepDeliveries.connectionId)).where(eq(loxepDeliveries.id, deliveryId)).limit(1)
  if (!row || row.delivery.status === 'accepted') return
  if (row.connection.status !== 'active') {
    await db.update(loxepDeliveries).set({ status: 'failed', lastError: 'Connection is disabled or revoked', updatedAt: new Date() }).where(eq(loxepDeliveries.id, deliveryId))
    return
  }
  const attempts = row.delivery.attempts + 1
  await db.update(loxepDeliveries).set({ attempts, lastAttemptAt: new Date(), updatedAt: new Date() }).where(eq(loxepDeliveries.id, deliveryId))
  const token = decryptLoxepToken({ ciphertext: row.connection.tokenCiphertext, nonce: row.connection.tokenNonce, authTag: row.connection.tokenAuthTag })
  const endpoint = `${row.connection.baseUrl}/api/v1/hooks/hoardcore/${encodeURIComponent(row.connection.remoteConnectionId)}`
  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': row.delivery.eventId },
      body: JSON.stringify(row.delivery.payload),
      signal: AbortSignal.timeout(15_000),
    })
    await db.update(loxepDeliveries).set({
      status: response.ok ? 'accepted' : 'failed',
      lastResponseStatus: response.status,
      lastError: response.ok ? null : `Loxep returned HTTP ${response.status}`,
      updatedAt: new Date(),
    }).where(eq(loxepDeliveries.id, deliveryId))
    if (!response.ok && ![400, 401, 403, 404, 409, 413, 422].includes(response.status)) throw new Error(`Loxep returned HTTP ${response.status}`)
  } catch (error) {
    await db.update(loxepDeliveries).set({ status: 'pending', lastError: error instanceof Error ? error.message.slice(0, 300) : 'Network error', updatedAt: new Date() }).where(eq(loxepDeliveries.id, deliveryId))
    throw error
  }
}

export async function receiveLoxepOutcome(db: Database, connectionId: string, rawBody: string) {
  const payload = loxepOutcomeEventSchema.parse(JSON.parse(rawBody))
  const payloadHash = createHash('sha256').update(rawBody, 'utf8').digest('hex')
  const [existing] = await db.select({ id: loxepOutcomeEvents.id, payloadHash: loxepOutcomeEvents.payloadHash }).from(loxepOutcomeEvents).where(and(eq(loxepOutcomeEvents.connectionId, connectionId), eq(loxepOutcomeEvents.eventId, payload.eventId))).limit(1)
  if (existing) {
    if (existing.payloadHash !== payloadHash) throw new LoxepOutcomeConflictError('event_id was already used for a different payload')
    return { duplicate: true, eventId: payload.eventId }
  }
  const [event] = await db.insert(loxepOutcomeEvents).values({ connectionId, eventId: payload.eventId, eventType: payload.eventType, listingId: payload.source.listingId, payload, payloadHash }).onConflictDoNothing({ target: [loxepOutcomeEvents.connectionId, loxepOutcomeEvents.eventId] }).returning({ id: loxepOutcomeEvents.id })
  return { duplicate: !event, eventId: payload.eventId }
}

export function loxepWebhookUrl(connectionId: string): string {
  const config = getServerConfig()
  const origin = config.BETTER_AUTH_URL?.replace(/\/$/u, '') ?? ''
  return `${origin}/api/v1/hooks/loxep/${connectionId}`
}
