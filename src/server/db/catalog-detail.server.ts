import { desc, eq } from 'drizzle-orm'
import { catalogProducts, catalogVariants, collectionRuns, sourceEvidence, sourceListingCurrent, sourceListingObservations, sourceListings } from './schema/catalog'
import { catalogSources } from './schema/catalog-sources'
import { listingDetailSchema, type ListingDetail } from '~/features/catalog/listing-detail.schemas'
import type { Database } from './db.server'

export async function getCatalogListingDetail(db: Database, listingId: string): Promise<ListingDetail | null> {
  const rows = await db.select({ listing: sourceListings, source: catalogSources, product: catalogProducts, variant: catalogVariants, current: sourceListingCurrent, observation: sourceListingObservations, evidence: sourceEvidence, run: collectionRuns })
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
  const observations = rows.flatMap((row) => row.observation ? [{ ...row.observation, evidence: row.evidence ? { ...row.evidence, payload: JSON.stringify(row.evidence.payload, null, 2), run: row.run } : null }] : [])
  return listingDetailSchema.parse({ id: first.listing.id, url: first.listing.url, imageUrl: first.listing.imageUrl, source: { id: first.source.id, displayName: first.source.displayName, moduleId: first.source.moduleId }, product: first.product, variant: first.variant, current: first.current, observations })
}
