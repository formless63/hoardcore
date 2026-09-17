import { and, desc, eq } from 'drizzle-orm'
import { catalogProducts, catalogVariants, collectionRuns, sourceEvidence, sourceListingCurrent, sourceListingObservations, sourceListings } from './schema/catalog'
import { catalogSources } from './schema/catalog-sources'
import { listingDetailSchema, type ListingDetail } from '~/features/catalog/listing-detail.schemas'
import type { Database } from './db.server'
import { getProductMediaGallery } from '~/features/media/media.server'

export async function getCatalogListingDetail(db: Database, listingId: string): Promise<ListingDetail | null> {
  const rows = await db.select({ listing: sourceListings, source: catalogSources, product: catalogProducts, variant: catalogVariants, current: sourceListingCurrent, observation: sourceListingObservations, evidence: { id: sourceEvidence.id, capturedAt: sourceEvidence.capturedAt, contentType: sourceEvidence.contentType, sha256: sourceEvidence.sha256 }, run: collectionRuns })
    .from(sourceListings)
    .innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
    .innerJoin(catalogVariants, eq(catalogVariants.id, sourceListings.variantId))
    .innerJoin(sourceListingCurrent, eq(sourceListingCurrent.listingId, sourceListings.id))
    .leftJoin(sourceListingObservations, eq(sourceListingObservations.listingId, sourceListings.id))
    .leftJoin(sourceEvidence, eq(sourceEvidence.id, sourceListingObservations.evidenceId))
    .leftJoin(collectionRuns, eq(collectionRuns.id, sourceEvidence.runId))
    .where(eq(sourceListings.id, listingId))
    .orderBy(desc(sourceListingObservations.observedAt))
  const first = rows[0]
  if (!first) return null
  const mediaCaptures = await getProductMediaGallery(db, listingId)
  const observations = rows.flatMap((row) => row.observation ? [{ ...row.observation, evidence: row.evidence ? { ...row.evidence, run: row.run } : null }] : [])
  return listingDetailSchema.parse({ id: first.listing.id, url: first.listing.url, imageUrl: first.listing.imageUrl, mediaCaptures, source: { id: first.source.id, displayName: first.source.displayName, moduleId: first.source.moduleId }, product: first.product, variant: first.variant, current: first.current, observations })
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
