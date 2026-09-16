import { and, asc, eq } from 'drizzle-orm'
import type { Database } from '~/server/db/db.server'
import { savedListingViews } from '~/server/db/schema'
import { listingFiltersSchema, type ListingFilters } from './listing-filters'

export async function listSavedViewsFromDatabase(db: Database, userId: string) {
  const rows = await db.select().from(savedListingViews).where(eq(savedListingViews.userId, userId)).orderBy(asc(savedListingViews.name))
  return rows.map((row) => ({ id: row.id, name: row.name, filters: listingFiltersSchema.parse(row.filters) }))
}

export async function saveListingViewToDatabase(db: Database, userId: string, name: string, filters: ListingFilters) {
  const [row] = await db.insert(savedListingViews).values({ userId, name, filters })
    .onConflictDoUpdate({ target: [savedListingViews.userId, savedListingViews.name], set: { filters, updatedAt: new Date() } })
    .returning({ id: savedListingViews.id })
  return { id: row.id }
}

export async function deleteListingViewFromDatabase(db: Database, userId: string, id: string) {
  const rows = await db.delete(savedListingViews).where(and(eq(savedListingViews.id, id), eq(savedListingViews.userId, userId))).returning({ id: savedListingViews.id })
  return { deleted: rows.length > 0 }
}
