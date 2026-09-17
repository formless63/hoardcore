import { and, desc, eq, lt, or } from 'drizzle-orm'
import { catalogProducts, catalogVariants, collectionRuns, sourceEvidence, sourceListingCurrent, sourceListingObservations, sourceListings } from './schema/catalog'
import { catalogSources } from './schema/catalog-sources'
import { listingDetailSchema, type ListingDetail } from '~/features/catalog/listing-detail.schemas'
import type { Database } from './db.server'
import { getProductMediaGallery } from '~/features/media/media.server'

export async function getCatalogListingDetail(db: Database, listingId: string): Promise<ListingDetail | null> {
  const [first] = await db.select({ listing: sourceListings, source: catalogSources, product: catalogProducts, variant: catalogVariants, current: sourceListingCurrent })
    .from(sourceListings)
    .innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
    .innerJoin(catalogVariants, eq(catalogVariants.id, sourceListings.variantId))
    .innerJoin(sourceListingCurrent, eq(sourceListingCurrent.listingId, sourceListings.id))
    .where(eq(sourceListings.id, listingId))
    .limit(1)
  if (!first) return null
  const [mediaCaptures, observationPage] = await Promise.all([getProductMediaGallery(db, listingId), getCatalogListingObservations(db, listingId)])
  return listingDetailSchema.parse({ id: first.listing.id, url: first.listing.url, imageUrl: first.listing.imageUrl, mediaCaptures, source: { id: first.source.id, displayName: first.source.displayName, moduleId: first.source.moduleId }, product: first.product, variant: first.variant, current: first.current, observations: observationPage.items, observationsHasMore: observationPage.hasMore })
}

export interface ObservationCursor { observedAt: Date; id: string }

/** Bounded newest-first history; callers may load older observations by cursor. */
export async function getCatalogListingObservations(db: Database, listingId: string, before?: ObservationCursor, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Observation page size must be between 1 and 200')
  const rows = await db.select({ observation: sourceListingObservations, evidence: { id: sourceEvidence.id, capturedAt: sourceEvidence.capturedAt, contentType: sourceEvidence.contentType, sha256: sourceEvidence.sha256 }, run: collectionRuns })
    .from(sourceListingObservations)
    .leftJoin(sourceEvidence, eq(sourceEvidence.id, sourceListingObservations.evidenceId))
    .leftJoin(collectionRuns, eq(collectionRuns.id, sourceEvidence.runId))
    .where(and(eq(sourceListingObservations.listingId, listingId), before ? or(
      lt(sourceListingObservations.observedAt, before.observedAt),
      and(eq(sourceListingObservations.observedAt, before.observedAt), lt(sourceListingObservations.id, before.id)),
    ) : undefined))
    .orderBy(desc(sourceListingObservations.observedAt), desc(sourceListingObservations.id))
    .limit(limit + 1)
  return { items: rows.slice(0, limit).map((row) => ({ ...row.observation, evidence: row.evidence ? { ...row.evidence, run: row.run } : null })), hasMore: rows.length > limit }
}

/** Fetch the potentially large source snapshot only when its evidence panel is opened. */
export async function getCatalogListingEvidencePayload(db: Database, listingId: string, evidenceId: string): Promise<string | null> {
  const [row] = await db.select({ payload: sourceEvidence.payload })
    .from(sourceListingObservations)
    .innerJoin(sourceEvidence, eq(sourceEvidence.id, sourceListingObservations.evidenceId))
    .where(and(eq(sourceListingObservations.listingId, listingId), eq(sourceEvidence.id, evidenceId)))
    .limit(1)
  return row ? JSON.stringify(row.payload, null, 2) : null
}
