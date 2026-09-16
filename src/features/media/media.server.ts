import { asc, eq, inArray } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import type { Database } from '~/server/db/db.server'
import { catalogSources } from '~/server/db/schema/catalog-sources'
import { mediaBlobs, listingMedia } from '~/server/db/schema/media'
import { catalogProducts, sourceListings } from '~/server/db/schema/catalog'
import type { MediaVariant } from './media.schemas'

export function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export interface PersistedDerivative {
  data: Buffer
  contentType: 'image/webp'
  width: number
  height: number
}

export interface PersistListingMediaInput {
  listingId: string
  sourceUrl: string
  sourceBytes: Uint8Array
  sourceContentType: string
  originalWidth: number
  originalHeight: number
  thumbnail: PersistedDerivative
  preview: PersistedDerivative
  capturedAt?: Date
}

async function persistBlob(db: Database, derivative: PersistedDerivative) {
  const checksum = sha256(derivative.data)
  const [blob] = await db.insert(mediaBlobs).values({
    sha256: checksum,
    contentType: derivative.contentType,
    width: derivative.width,
    height: derivative.height,
    byteLength: derivative.data.byteLength,
    data: derivative.data,
  }).onConflictDoUpdate({
    target: mediaBlobs.sha256,
    set: { sha256: checksum },
  }).returning({ id: mediaBlobs.id })
  return blob
}

export async function persistListingMedia(db: Database, input: PersistListingMediaInput) {
  return db.transaction(async (tx) => {
    const thumbnail = await persistBlob(tx as unknown as Database, input.thumbnail)
    const preview = await persistBlob(tx as unknown as Database, input.preview)
    const [capture] = await tx.insert(listingMedia).values({
      listingId: input.listingId,
      sourceUrl: input.sourceUrl,
      sourceSha256: sha256(input.sourceBytes),
      sourceContentType: input.sourceContentType,
      originalWidth: input.originalWidth,
      originalHeight: input.originalHeight,
      thumbnailBlobId: thumbnail.id,
      previewBlobId: preview.id,
      capturedAt: input.capturedAt ?? new Date(),
    }).onConflictDoUpdate({
      target: [listingMedia.listingId, listingMedia.sourceUrl],
      set: {
        sourceSha256: sha256(input.sourceBytes), sourceContentType: input.sourceContentType,
        originalWidth: input.originalWidth, originalHeight: input.originalHeight,
        thumbnailBlobId: thumbnail.id, previewBlobId: preview.id, capturedAt: input.capturedAt ?? new Date(),
      },
    }).returning()
    return capture
  })
}

export async function getAuthenticatedMediaVariant(db: Database, captureId: string, variant: MediaVariant) {
  const blobId = variant === 'thumbnail' ? listingMedia.thumbnailBlobId : listingMedia.previewBlobId
  const [row] = await db.select({
    captureId: listingMedia.id,
    sha256: mediaBlobs.sha256,
    contentType: mediaBlobs.contentType,
    data: mediaBlobs.data,
  }).from(listingMedia)
    .innerJoin(mediaBlobs, eq(mediaBlobs.id, blobId))
    .where(eq(listingMedia.id, captureId))
    .limit(1)
  return row ?? null
}

export async function getListingMediaCapture(db: Database, listingId: string) {
  const [capture] = await db.select({ id: listingMedia.id, sourceUrl: listingMedia.sourceUrl, capturedAt: listingMedia.capturedAt })
    .from(listingMedia).where(eq(listingMedia.listingId, listingId)).orderBy(listingMedia.capturedAt).limit(1)
  return capture ?? null
}

/** One batched lookup for dense catalog tables; never fetch source URLs. */
export async function getListingMediaCaptures(db: Database, listingIds: readonly string[]) {
  if (!listingIds.length) return new Map<string, { id: string; sourceUrl: string; capturedAt: Date }>()
  const rows = await db.select({
    listingId: listingMedia.listingId,
    id: listingMedia.id,
    sourceUrl: listingMedia.sourceUrl,
    capturedAt: listingMedia.capturedAt,
    primaryUrl: sourceListings.imageUrl,
  }).from(listingMedia).innerJoin(sourceListings, eq(sourceListings.id, listingMedia.listingId))
    .where(inArray(listingMedia.listingId, [...new Set(listingIds)]))
  // A listing can retain old source URLs for audit. Prefer the most recently
  // captured derivative in table views.
  return rows.reduce((captures, row) => {
    const current = captures.get(row.listingId)
    const currentIsPrimary = current?.sourceUrl === row.primaryUrl
    const rowIsPrimary = row.sourceUrl === row.primaryUrl
    if (!current || (rowIsPrimary && !currentIsPrimary) || (rowIsPrimary === currentIsPrimary && current.capturedAt < row.capturedAt)) captures.set(row.listingId, row)
    return captures
  }, new Map<string, { id: string; sourceUrl: string; capturedAt: Date }>())
}

/** All captured variants for the product behind a listing, for detail galleries. */
export async function getProductMediaGallery(db: Database, listingId: string) {
  const [listing] = await db.select({ productId: sourceListings.productId }).from(sourceListings).where(eq(sourceListings.id, listingId)).limit(1)
  if (!listing) return []
  const rows = await db.select({ id: listingMedia.id, listingId: listingMedia.listingId, sourceUrl: listingMedia.sourceUrl, capturedAt: listingMedia.capturedAt })
    .from(listingMedia)
    .innerJoin(sourceListings, eq(sourceListings.id, listingMedia.listingId))
    .where(eq(sourceListings.productId, listing.productId))
    .orderBy(listingMedia.capturedAt)
  return [...new Map(rows.map((row) => [row.sourceUrl, row])).values()]
}

export async function getCaptureCandidate(db: Database, listingId: string) {
  const [candidate] = await db.select({
    listingId: sourceListings.id,
    imageUrl: sourceListings.imageUrl,
    imageUrls: catalogProducts.imageUrls,
    sourceId: catalogSources.id,
    moduleId: catalogSources.moduleId,
    config: catalogSources.config,
  }).from(sourceListings)
    .innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
    .where(eq(sourceListings.id, listingId)).limit(1)
  return candidate ?? null
}

export interface SourceMediaCandidate { listingId: string; sourceUrl: string }

/**
 * Expands a product's catalog image URLs only inside an explicitly requested
 * capture batch. This is not part of normal catalog collection and is kept
 * in a single app-DB query to avoid source-side product fan-out.
 */
export async function listSourceMediaCandidates(db: Database, sourceId: string): Promise<SourceMediaCandidate[]> {
  const [rows, captured] = await Promise.all([
    db.select({ listingId: sourceListings.id, primaryUrl: sourceListings.imageUrl, imageUrls: catalogProducts.imageUrls })
      .from(sourceListings).innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
      .where(eq(sourceListings.sourceId, sourceId)).orderBy(asc(sourceListings.id)),
    db.select({ listingId: listingMedia.listingId, sourceUrl: listingMedia.sourceUrl })
      .from(listingMedia).innerJoin(sourceListings, eq(sourceListings.id, listingMedia.listingId))
      .where(eq(sourceListings.sourceId, sourceId)),
  ])
  const alreadyCaptured = new Set(captured.map((row) => `${row.listingId}\u0000${row.sourceUrl}`))
  const candidates: SourceMediaCandidate[] = []
  for (const row of rows) {
    for (const sourceUrl of new Set([row.primaryUrl, ...row.imageUrls].filter((url): url is string => Boolean(url)))) {
      const key = `${row.listingId}\u0000${sourceUrl}`
      if (!alreadyCaptured.has(key)) candidates.push({ listingId: row.listingId, sourceUrl })
    }
  }
  return candidates
}
