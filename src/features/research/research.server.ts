import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Database } from '~/server/db/db.server'
import { catalogProducts, catalogVariants, sourceListings } from '~/server/db/schema/catalog'
import { researchApiTokens, researchBatches, researchComparables, researchSubmissions } from '~/server/db/schema/research'
import { createResearchBatchExport, type ResearchBatchExport } from './research.batch'
import { previewResearchResult, type ResearchPreview } from './research.preview'
import { parseResearchPacket, parseResearchResult, type ResearchPacket, type ResearchResult } from './research.schemas'
import type { ResearchCatalogRecord } from './research.batch'

export const RESEARCH_WRITE_SCOPE = 'research:write'

function tokenDigest(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function createResearchApiTokenValue() {
  return `hc_rsch_${randomBytes(32).toString('base64url')}`
}

export async function createResearchApiToken(db: Database, userId: string, name: string, expiresAt?: Date) {
  const token = createResearchApiTokenValue()
  const [row] = await db.insert(researchApiTokens).values({
    userId, name, tokenHash: tokenDigest(token), scopes: [RESEARCH_WRITE_SCOPE], expiresAt,
  }).returning({ id: researchApiTokens.id, name: researchApiTokens.name, expiresAt: researchApiTokens.expiresAt })
  return { ...row, token }
}

export async function listResearchApiTokens(db: Database, userId: string) {
  return db.select({ id: researchApiTokens.id, name: researchApiTokens.name, scopes: researchApiTokens.scopes, expiresAt: researchApiTokens.expiresAt, lastUsedAt: researchApiTokens.lastUsedAt, revokedAt: researchApiTokens.revokedAt, createdAt: researchApiTokens.createdAt })
    .from(researchApiTokens).where(eq(researchApiTokens.userId, userId)).orderBy(desc(researchApiTokens.createdAt))
}

export async function revokeResearchApiToken(db: Database, userId: string, tokenId: string) {
  const rows = await db.update(researchApiTokens).set({ revokedAt: new Date() }).where(and(eq(researchApiTokens.id, tokenId), eq(researchApiTokens.userId, userId), isNull(researchApiTokens.revokedAt))).returning({ id: researchApiTokens.id })
  return { revoked: rows.length > 0 }
}

/** Authenticates a short-lived, revocable external-agent credential. */
export async function authorizeResearchApiToken(db: Database, bearerToken: string, requiredScope: string) {
  const digest = tokenDigest(bearerToken)
  const [row] = await db.select().from(researchApiTokens).where(eq(researchApiTokens.tokenHash, digest)).limit(1)
  // Keep comparison constant-time if a row exists; this avoids accidentally
  // making a future token prefix scheme an oracle.
  if (!row || !timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(digest))) return null
  if (row.revokedAt || (row.expiresAt && row.expiresAt <= new Date()) || !row.scopes.includes(requiredScope)) return null
  await db.update(researchApiTokens).set({ lastUsedAt: new Date() }).where(eq(researchApiTokens.id, row.id))
  return { userId: row.userId, tokenId: row.id }
}

export async function saveResearchBatch(db: Database, userId: string, packet: ResearchPacket, prompt: string) {
  const inserted = await db.insert(researchBatches).values({ packetId: packet.packetId, createdByUserId: userId, packet, prompt })
    .onConflictDoNothing().returning({ id: researchBatches.id, packetId: researchBatches.packetId })
  if (inserted[0]) return inserted[0]
  const [existing] = await db.select().from(researchBatches).where(eq(researchBatches.packetId, packet.packetId)).limit(1)
  if (!existing || existing.createdByUserId !== userId || !isDeepStrictEqual(existing.packet, packet) || existing.prompt !== prompt) {
    throw new Error('ResearchPacket ID is already bound to a different immutable packet')
  }
  return { id: existing.id, packetId: existing.packetId }
}

export async function createAndSaveResearchBatch(db: Database, userId: string, records: ResearchCatalogRecord[]): Promise<ResearchBatchExport & { id: string }> {
  const exported = createResearchBatchExport(records)
  const saved = await saveResearchBatch(db, userId, exported.packet, exported.prompt)
  return { ...exported, id: saved.id }
}

/** Persists an already-created export without reserializing or changing its ID. */
export async function persistResearchBatchExport(db: Database, userId: string, exported: ResearchBatchExport) {
  const saved = await saveResearchBatch(db, userId, exported.packet, exported.prompt)
  return { ...exported, id: saved.id }
}

async function findBatchForUser(db: Database, userId: string, packetId: string) {
  const [batch] = await db.select().from(researchBatches).where(and(eq(researchBatches.packetId, packetId), eq(researchBatches.createdByUserId, userId))).limit(1)
  return batch
}

async function resolveReferenceIds(db: Database, packet: ResearchPacket) {
  const productKeys = packet.records.flatMap((record) => record.product ? [record.product.hoardcoreId] : [])
  const variantKeys = packet.records.flatMap((record) => record.variant ? [record.variant.hoardcoreId] : [])
  const listingKeys = packet.records.flatMap((record) => record.listing ? [record.listing.hoardcoreId] : [])
  const [products, variants, listings] = await Promise.all([
    productKeys.length ? db.select({ id: catalogProducts.id, key: catalogProducts.productKey }).from(catalogProducts).where(or(inArray(catalogProducts.productKey, productKeys), inArray(catalogProducts.id, productKeys))) : [],
    variantKeys.length ? db.select({ id: catalogVariants.id, key: catalogVariants.variantKey }).from(catalogVariants).where(or(inArray(catalogVariants.variantKey, variantKeys), inArray(catalogVariants.id, variantKeys))) : [],
    listingKeys.length ? db.select({ id: sourceListings.id, key: sourceListings.listingKey }).from(sourceListings).where(or(inArray(sourceListings.listingKey, listingKeys), inArray(sourceListings.id, listingKeys))) : [],
  ])
  return {
    products: new Map(products.flatMap((row) => [[row.key, row.id], [row.id, row.id]])),
    variants: new Map(variants.flatMap((row) => [[row.key, row.id], [row.id, row.id]])),
    listings: new Map(listings.flatMap((row) => [[row.key, row.id], [row.id, row.id]])),
  }
}

export async function importResearchPreview(db: Database, userId: string, preview: ResearchPreview) {
  if (preview.status === 'invalid' || !preview.result) throw new Error('Only valid or partial, schema-valid research results can be imported')
  const result = parseResearchResult(preview.result)
  const batch = await findBatchForUser(db, userId, result.packetId)
  if (!batch) throw new Error('ResearchPacket is not available to this user')
  const packet = parseResearchPacket(batch.packet)
  const refs = await resolveReferenceIds(db, packet)
  const validRecords = preview.records.flatMap((item) => item.record && item.status !== 'invalid' ? [item.record] : [])
  // A submission and all of its projections are one immutable unit. If any
  // comparable fails, rolling back the submission keeps the same result ID
  // retryable instead of incorrectly treating an incomplete import as done.
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(researchSubmissions).values({
      batchId: batch.id, submittedByUserId: userId, resultId: result.resultId, status: preview.status,
      rawPayload: preview.rawInput, normalizedPayload: result, diagnostics: [...preview.diagnostics, ...preview.records.flatMap((record) => record.diagnostics)], completedAt: new Date(result.completedAt),
    }).onConflictDoNothing().returning({ id: researchSubmissions.id })
    if (!inserted[0]) {
      const [existing] = await tx.select({ id: researchSubmissions.id, rawPayload: researchSubmissions.rawPayload }).from(researchSubmissions)
        .where(and(eq(researchSubmissions.batchId, batch.id), eq(researchSubmissions.resultId, result.resultId))).limit(1)
      if (existing?.rawPayload === preview.rawInput) return { id: existing.id, status: preview.status, comparableCount: 0, idempotent: true }
      throw new Error('Research result ID is already bound to a different immutable submission')
    }
    const rows = validRecords.flatMap((record) => {
      const packetRecord = packet.records.find((candidate) => candidate.reference.entityType === record.reference.entityType && candidate.reference.hoardcoreId === record.reference.hoardcoreId)
      if (!packetRecord) return []
      return (record.comparables ?? []).map((comparable) => ({
        submissionId: inserted[0].id,
        sourceListingId: packetRecord.listing ? refs.listings.get(packetRecord.listing.hoardcoreId) : null,
        productId: packetRecord.product ? refs.products.get(packetRecord.product.hoardcoreId) : null,
        variantId: packetRecord.variant ? refs.variants.get(packetRecord.variant.hoardcoreId) : null,
        comparableId: comparable.comparableId,
        channel: comparable.channel,
        evidenceType: comparable.evidenceType,
        price: String(comparable.price),
        shipping: comparable.shipping === undefined ? null : String(comparable.shipping),
        currency: comparable.currency.toUpperCase(),
        condition: comparable.condition ?? null,
        observedAt: comparable.observedAt ? new Date(comparable.observedAt) : null,
        soldAt: comparable.soldAt ? new Date(comparable.soldAt) : null,
        sampleSize: comparable.sampleSize ?? null,
        sampleWindow: comparable.sampleWindow ?? null,
        url: comparable.url ?? null,
        citationId: comparable.citationId ?? null,
        notes: comparable.notes ?? null,
      }))
    })
    if (rows.length) await tx.insert(researchComparables).values(rows)
    return { id: inserted[0].id, status: preview.status, comparableCount: rows.length }
  })
}

export async function importResearchResult(db: Database, userId: string, input: string | unknown) {
  const candidate = typeof input === 'string' ? JSON.parse(input) : input
  const result = parseResearchResult(candidate)
  const batch = await findBatchForUser(db, userId, result.packetId)
  if (!batch) throw new Error('ResearchPacket is not available to this user')
  const preview = previewResearchResult(typeof input === 'string' ? input : JSON.stringify(input), parseResearchPacket(batch.packet))
  return importResearchPreview(db, userId, preview)
}

export async function listResearchHistory(db: Database, userId: string, sourceListingId: string) {
  // Query the packet envelope before loading raw payloads. A user may have
  // thousands of unrelated submissions, including notes-only records.
  const listingEnvelope = JSON.stringify({ records: [{ listing: { hoardcoreId: sourceListingId } }] })
  const listingReference = JSON.stringify({ records: [{ reference: { entityType: 'source_listing', hoardcoreId: sourceListingId } }] })
  return db.select({ id: researchSubmissions.id, status: researchSubmissions.status, resultId: researchSubmissions.resultId, completedAt: researchSubmissions.completedAt, createdAt: researchSubmissions.createdAt, rawPayload: researchSubmissions.rawPayload, normalizedPayload: researchSubmissions.normalizedPayload })
    .from(researchSubmissions)
    .innerJoin(researchBatches, eq(researchBatches.id, researchSubmissions.batchId))
    .where(and(eq(researchBatches.createdByUserId, userId), or(
      sql`${researchBatches.packet} @> ${listingEnvelope}::jsonb`,
      sql`${researchBatches.packet} @> ${listingReference}::jsonb`,
    )))
    .orderBy(desc(researchSubmissions.createdAt))
    .limit(50)
}

export async function listResearchComparables(db: Database, userId: string, sourceListingId: string) {
  return db.select({
    id: researchComparables.id, channel: researchComparables.channel, evidenceType: researchComparables.evidenceType,
    price: researchComparables.price, shipping: researchComparables.shipping, currency: researchComparables.currency,
    condition: researchComparables.condition, observedAt: researchComparables.observedAt, soldAt: researchComparables.soldAt,
    sampleSize: researchComparables.sampleSize, sampleWindow: researchComparables.sampleWindow, url: researchComparables.url,
    notes: researchComparables.notes, submissionId: researchSubmissions.id, submittedAt: researchSubmissions.createdAt,
  }).from(researchComparables)
    .innerJoin(researchSubmissions, eq(researchSubmissions.id, researchComparables.submissionId))
    .innerJoin(researchBatches, eq(researchBatches.id, researchSubmissions.batchId))
    .where(and(eq(researchBatches.createdByUserId, userId), eq(researchComparables.sourceListingId, sourceListingId)))
    .orderBy(desc(researchComparables.createdAt))
    .limit(200)
}

export type ResearchComparableSummaryType = 'active_asking' | 'completed_sale' | 'retail_offer'
export interface ResearchComparableSummary {
  channel: string
  currency: string
  count: number
  medianPrice: number
}
export type ResearchSummariesByListing = Record<string, Partial<Record<ResearchComparableSummaryType, ResearchComparableSummary[]>>>
export interface ResearchComparableSummaryRow {
  listingId: string | null
  evidenceType: ResearchComparableSummaryType
  channel: string
  currency: string
  price: string
}

function median(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2
}

/**
 * Reduces all user-owned comparable evidence in one query. Currency is part
 * and channel are part of the grouping key: no conversion or cross-market
 * median is implied.
 */
export async function summarizeResearchForListings(db: Database, userId: string, listingIds: string[]): Promise<ResearchSummariesByListing> {
  if (!listingIds.length) return {}
  const rows = await db.select({
    listingId: researchComparables.sourceListingId, evidenceType: researchComparables.evidenceType, channel: researchComparables.channel,
    currency: researchComparables.currency, price: researchComparables.price,
  }).from(researchComparables)
    .innerJoin(researchSubmissions, eq(researchSubmissions.id, researchComparables.submissionId))
    .innerJoin(researchBatches, eq(researchBatches.id, researchSubmissions.batchId))
    .where(and(eq(researchBatches.createdByUserId, userId), inArray(researchComparables.sourceListingId, listingIds)))

  return summarizeComparableRows(rows)
}

/** Pure reducer kept separate so grouping and currency boundaries stay testable. */
export function summarizeComparableRows(rows: ResearchComparableSummaryRow[]): ResearchSummariesByListing {
  const grouped = new Map<string, number[]>()
  for (const row of rows) {
    if (!row.listingId) continue
    const key = `${row.listingId}\u0000${row.evidenceType}\u0000${row.channel}\u0000${row.currency.toUpperCase()}`
    const prices = grouped.get(key) ?? []
    prices.push(Number(row.price))
    grouped.set(key, prices)
  }
  const summaries: ResearchSummariesByListing = {}
  for (const [key, prices] of grouped) {
    const [listingId, evidenceType, channel, currency] = key.split('\u0000') as [string, ResearchComparableSummaryType, string, string]
    const listing = summaries[listingId] ?? (summaries[listingId] = {})
    const type = listing[evidenceType] ?? (listing[evidenceType] = [])
    type.push({ channel, currency, count: prices.length, medianPrice: median(prices) })
  }
  for (const listing of Object.values(summaries)) for (const type of Object.values(listing)) type?.sort((left, right) => left.channel.localeCompare(right.channel) || left.currency.localeCompare(right.currency))
  return summaries
}
