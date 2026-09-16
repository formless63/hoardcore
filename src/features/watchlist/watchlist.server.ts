import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Database } from '~/server/db/db.server'
import { catalogProducts, catalogVariants, sourceListingCurrent, sourceListings } from '~/server/db/schema/catalog'
import { catalogSources } from '~/server/db/schema/catalog-sources'
import { watchedListings } from '~/server/db/schema/watched-listings'

export async function listWatchedListingIds(db: Database, userId: string) {
  const rows = await db.select({ listingId: watchedListings.listingId })
    .from(watchedListings).where(eq(watchedListings.userId, userId))
  return rows.map((row) => row.listingId)
}

export async function setListingWatchedInDatabase(db: Database, userId: string, listingId: string, watched: boolean) {
  if (!watched) {
    const rows = await db.delete(watchedListings)
      .where(and(eq(watchedListings.userId, userId), eq(watchedListings.listingId, listingId)))
      .returning({ id: watchedListings.id })
    return { watched: false, changed: rows.length > 0 }
  }

  const [row] = await db.insert(watchedListings).values({ userId, listingId })
    .onConflictDoNothing({ target: [watchedListings.userId, watchedListings.listingId] })
    .returning({ id: watchedListings.id })
  return { watched: true, changed: Boolean(row) }
}

export async function listWatchedListingsFromDatabase(db: Database, userId: string) {
  return db.select({
    id: sourceListings.id,
    title: catalogProducts.title,
    variantTitle: catalogVariants.title,
    sourceName: catalogSources.displayName,
    price: sourceListingCurrent.price,
    currency: sourceListingCurrent.currency,
    available: sourceListingCurrent.available,
    observedAt: sourceListingCurrent.observedAt,
  }).from(watchedListings)
    .innerJoin(sourceListings, eq(sourceListings.id, watchedListings.listingId))
    .innerJoin(sourceListingCurrent, eq(sourceListingCurrent.listingId, sourceListings.id))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
    .innerJoin(catalogVariants, eq(catalogVariants.id, sourceListings.variantId))
    .innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
    .where(eq(watchedListings.userId, userId))
    .orderBy(asc(catalogProducts.title))
}

export async function watchedUserIdsForListing(db: Database, listingId: string) {
  const rows = await db.select({ userId: watchedListings.userId }).from(watchedListings)
    .where(eq(watchedListings.listingId, listingId))
  return rows.map((row) => row.userId)
}

export async function watchedListingIdsForUser(db: Database, userId: string, candidates: readonly string[]) {
  if (!candidates.length) return []
  const rows = await db.select({ listingId: watchedListings.listingId }).from(watchedListings)
    .where(and(eq(watchedListings.userId, userId), inArray(watchedListings.listingId, [...candidates])))
  return rows.map((row) => row.listingId)
}
