import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { catalogProducts, catalogSources, catalogVariants, sourceListingCurrent, sourceListings } from '~/server/db/schema'
import { listCurrentCatalogListings } from '~/server/db/catalog-persistence.server'
import { deleteCategoryGroupOverride, listCategoryGroupReview, saveCategoryGroupOverride } from './category-overrides.server'

const suffix = `category-override-${Date.now()}-${Math.random().toString(36).slice(2)}`
const sourceCategory = 'Panelboards & Accessories'
const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip
let sourceOneId = ''
let sourceTwoId = ''

describeWithDatabase('source category group overrides', () => {
  const db = () => getDatabase()

  beforeAll(async () => {
    const [sourceOne] = await db().insert(catalogSources).values({ moduleId: 'test', displayName: `Override source one ${suffix}`, sourceKey: `${suffix}-one`, config: {} }).returning({ id: catalogSources.id })
    const [sourceTwo] = await db().insert(catalogSources).values({ moduleId: 'test', displayName: `Override source two ${suffix}`, sourceKey: `${suffix}-two`, config: {} }).returning({ id: catalogSources.id })
    sourceOneId = sourceOne!.id; sourceTwoId = sourceTwo!.id
    for (const [index, sourceId] of [sourceOneId, sourceTwoId].entries()) {
      const [product] = await db().insert(catalogProducts).values({ productKey: `${suffix}-product-${index}`, title: `Override product ${index}`, productType: sourceCategory, tags: [] }).returning({ id: catalogProducts.id })
      const [variant] = await db().insert(catalogVariants).values({ productId: product!.id, variantKey: `${suffix}-variant-${index}`, title: 'Default Title' }).returning({ id: catalogVariants.id })
      const [listing] = await db().insert(sourceListings).values({ sourceId, productId: product!.id, variantId: variant!.id, listingKey: `${suffix}-listing-${index}`, url: `https://example.test/${suffix}/${index}` }).returning({ id: sourceListings.id })
      await db().insert(sourceListingCurrent).values({ listingId: listing!.id, title: `Override product ${index}`, available: true, observedAt: new Date() })
    }
  })

  afterAll(async () => {
    if (sourceOneId) await db().delete(catalogSources).where(eq(catalogSources.id, sourceOneId))
    if (sourceTwoId) await db().delete(catalogSources).where(eq(catalogSources.id, sourceTwoId))
    await closeDatabase()
  })

  it('applies a mapping only to its source and restores the starter group when deleted', async () => {
    const before = await listCurrentCatalogListings(db())
    expect(before.filter((listing) => [sourceOneId, sourceTwoId].includes(listing.sourceId)).map((listing) => listing.categoryGroup)).toEqual(['distribution', 'distribution'])

    await saveCategoryGroupOverride(db(), { sourceId: sourceOneId, sourceCategory, categoryGroup: 'tools-testing' })
    const mapped = await listCurrentCatalogListings(db())
    expect(mapped.find((listing) => listing.sourceId === sourceOneId)?.categoryGroup).toBe('tools-testing')
    expect(mapped.find((listing) => listing.sourceId === sourceTwoId)?.categoryGroup).toBe('distribution')

    const review = await listCategoryGroupReview(db())
    expect(review.overrides).toContainEqual(expect.objectContaining({ sourceId: sourceOneId, sourceCategory, categoryGroup: 'tools-testing', listings: 1 }))

    await deleteCategoryGroupOverride(db(), { sourceId: sourceOneId, sourceCategory })
    const restored = await listCurrentCatalogListings(db())
    expect(restored.find((listing) => listing.sourceId === sourceOneId)?.categoryGroup).toBe('distribution')
  })
})
