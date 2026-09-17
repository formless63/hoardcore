import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { NormalizedCatalogRecord } from '~/modules/types'
import { emptyListingFilters } from '~/features/catalog/listing-filters'
import { saveCategoryGroupOverride } from '~/features/catalog/category-overrides.server'
import { closeDatabase, getDatabase } from './index.server'
import { listCurrentCatalogListingsPage, persistCatalogSnapshot } from './catalog-persistence.server'
import { catalogSources } from './schema'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip
const suffix = `listing-page-${Date.now()}-${Math.random().toString(36).slice(2)}`

function record(index: number, category: string | null = 'Portable Tools'): NormalizedCatalogRecord {
  const price = index === 1 ? 1 : index + 10
  return {
    product: { productKey: `${suffix}-product-${index}`, title: `Synthetic ${category ?? 'Uncategorized'} ${index}`, brand: index % 2 ? 'Maker B' : 'Maker A', productType: category ?? undefined, tags: index === 1 ? ['rare-tag'] : ['synthetic'] },
    variant: { variantKey: `${suffix}-variant-${index}`, productKey: `${suffix}-product-${index}`, title: 'Default', sku: `SYN-${index}`, price, currency: 'USD', available: index % 3 !== 0 },
    listing: { listingKey: `${suffix}-listing-${index}`, sourceKey: suffix, productKey: `${suffix}-product-${index}`, variantKey: `${suffix}-variant-${index}`, url: `https://example.test/${suffix}/${index}`, current: { title: `Synthetic ${index}`, price, compareAtPrice: index === 1 ? 10 : price + 1, currency: 'USD', available: index % 3 !== 0, stockQuantity: index }, observedAt: '2026-09-17T00:00:00Z' },
  }
}

describeWithDatabase('current listing page query', () => {
  let sourceId = ''
  const db = () => getDatabase()

  beforeEach(async () => {
    const [source] = await db().insert(catalogSources).values({ moduleId: 'test', displayName: `Paged source ${suffix}`, sourceKey: suffix, config: {} }).returning({ id: catalogSources.id })
    sourceId = source!.id
    const records = Array.from({ length: 51 }, (_, index) => record(index))
    records.push(record(51, 'Custom bucket'), record(52, null))
    await persistCatalogSnapshot(db(), sourceId, records, { observedAt: new Date('2026-09-17T00:00:00Z') })
    await saveCategoryGroupOverride(db(), { sourceId, sourceCategory: 'Custom bucket', categoryGroup: 'lighting' })
  })

  afterEach(async () => { if (sourceId) await db().delete(catalogSources).where(eq(catalogSources.id, sourceId)); sourceId = '' })
  afterAll(async () => { await closeDatabase() })

  it('filters, sorts, paginates, and returns compact facets without loading the catalog', async () => {
    const tools = await listCurrentCatalogListingsPage(db(), {
      filters: { ...emptyListingFilters, sourceId, categoryGroup: 'tools-testing' }, sorting: [{ id: 'price', desc: false }], page: 0, pageSize: 50,
    })
    expect(tools.total).toBe(51)
    expect(tools.listings).toHaveLength(50)
    expect(tools.listings[0]?.price).toBe('1.00')
    expect(tools.pageCount).toBe(2)
    const finalPage = await listCurrentCatalogListingsPage(db(), { filters: { ...emptyListingFilters, sourceId, categoryGroup: 'tools-testing' }, sorting: [{ id: 'price', desc: false }], page: 1, pageSize: 50 })
    expect(finalPage.listings).toHaveLength(1)

    const discounted = await listCurrentCatalogListingsPage(db(), { filters: { ...emptyListingFilters, sourceId, minDiscountPercent: 80, query: 'rare-tag' }, sorting: [], page: 0, pageSize: 50 })
    expect(discounted.total).toBe(1)
    expect(discounted.listings[0]?.sku).toBe('SYN-1')
    expect(tools.facets.categories).toContainEqual({ value: 'Custom bucket', categoryGroups: ['lighting'], count: 1 })
    expect(tools.facets.categoryGroupCounts['tools-testing']).toBeGreaterThanOrEqual(51)
    expect(tools.facets.categoryGroupCounts.lighting).toBeGreaterThanOrEqual(1)
    expect(tools.facets.categoryGroupCounts.unmapped).toBeGreaterThanOrEqual(1)
    expect(tools.facets.manufacturers).toEqual(expect.arrayContaining(['Maker A', 'Maker B']))
    expect(tools.facets.sources).toContainEqual({ id: sourceId, name: `Paged source ${suffix}` })
  })
})
