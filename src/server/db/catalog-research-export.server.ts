import { desc, eq, inArray } from 'drizzle-orm'
import type { Database } from './db.server'
import { catalogProducts, catalogVariants, sourceListingCurrent, sourceListingObservations, sourceListings } from './schema/catalog'
import { catalogSources } from './schema/catalog-sources'

/** One row per selected listing; never loads large evidence payloads or full history. */
export async function loadResearchExportRows(db: Database, listingIds: string[]) {
  const [rows, latestObservations] = await Promise.all([
    db.select({ listing: sourceListings, current: sourceListingCurrent, product: catalogProducts, variant: catalogVariants, source: catalogSources })
      .from(sourceListings)
      .innerJoin(sourceListingCurrent, eq(sourceListingCurrent.listingId, sourceListings.id))
      .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
      .innerJoin(catalogVariants, eq(catalogVariants.id, sourceListings.variantId))
      .innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
      .where(inArray(sourceListings.id, listingIds)),
    db.selectDistinctOn([sourceListingObservations.listingId], {
      listingId: sourceListingObservations.listingId, evidenceId: sourceListingObservations.evidenceId,
    }).from(sourceListingObservations)
      .where(inArray(sourceListingObservations.listingId, listingIds))
      .orderBy(sourceListingObservations.listingId, desc(sourceListingObservations.observedAt), desc(sourceListingObservations.id)),
  ])
  const byId = new Map(rows.map((row) => [row.listing.id, row]))
  const evidenceById = new Map(latestObservations.map((row) => [row.listingId, row.evidenceId]))
  return listingIds.map((id) => {
    const row = byId.get(id)
    if (!row) throw new Error('One or more selected listings are unavailable')
    return { ...row, evidenceId: evidenceById.get(id) ?? null }
  })
}
