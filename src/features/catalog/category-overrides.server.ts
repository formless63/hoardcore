import { and, asc, count, eq, isNotNull } from 'drizzle-orm'
import type { Database } from '~/server/db/db.server'
import { catalogProducts, catalogSources, sourceCategoryGroupOverrides, sourceListings } from '~/server/db/schema'
import { categoryGroupFor, unmappedCategoryGroup } from './category-groups'
import type { z } from 'zod'
import type { categoryGroupOverrideInputSchema, deleteCategoryGroupOverrideInputSchema } from './category-overrides.schemas'

type CategoryOverrideInput = z.output<typeof categoryGroupOverrideInputSchema>
type DeleteCategoryOverrideInput = z.output<typeof deleteCategoryGroupOverrideInputSchema>

export function resolvedCategoryGroup(rawCategory: string | null | undefined, override?: string | null) {
  return override ?? categoryGroupFor(rawCategory)
}

export async function listCategoryGroupReview(db: Database) {
  const rows = await db.select({
    sourceId: catalogSources.id,
    sourceName: catalogSources.displayName,
    sourceCategory: catalogProducts.productType,
    overrideGroup: sourceCategoryGroupOverrides.categoryGroup,
    listings: count(sourceListings.id),
  }).from(sourceListings)
    .innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
    .leftJoin(sourceCategoryGroupOverrides, and(
      eq(sourceCategoryGroupOverrides.sourceId, sourceListings.sourceId),
      eq(sourceCategoryGroupOverrides.sourceCategory, catalogProducts.productType),
    ))
    .where(isNotNull(catalogProducts.productType))
    .groupBy(catalogSources.id, catalogSources.displayName, catalogProducts.productType, sourceCategoryGroupOverrides.categoryGroup)
    .orderBy(asc(catalogSources.displayName), asc(catalogProducts.productType))

  const categories = rows.flatMap((row) => row.sourceCategory?.trim() ? [{
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    sourceCategory: row.sourceCategory,
    categoryGroup: resolvedCategoryGroup(row.sourceCategory, row.overrideGroup),
    overrideGroup: row.overrideGroup,
    listings: Number(row.listings),
  }] : [])
  return {
    unmapped: categories.filter((category) => category.categoryGroup === unmappedCategoryGroup.id),
    overrides: categories.filter((category) => category.overrideGroup !== null),
    unmappedListingCount: categories.filter((category) => category.categoryGroup === unmappedCategoryGroup.id).reduce((total, category) => total + category.listings, 0),
  }
}

export async function saveCategoryGroupOverride(db: Database, input: CategoryOverrideInput) {
  await db.insert(sourceCategoryGroupOverrides).values(input).onConflictDoUpdate({
    target: [sourceCategoryGroupOverrides.sourceId, sourceCategoryGroupOverrides.sourceCategory],
    set: { categoryGroup: input.categoryGroup, updatedAt: new Date() },
  })
  return input
}

export async function deleteCategoryGroupOverride(db: Database, input: DeleteCategoryOverrideInput) {
  await db.delete(sourceCategoryGroupOverrides).where(and(
    eq(sourceCategoryGroupOverrides.sourceId, input.sourceId),
    eq(sourceCategoryGroupOverrides.sourceCategory, input.sourceCategory),
  ))
  return input
}
