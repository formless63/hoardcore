import { z } from 'zod'
import type { CurrentListing } from './catalog.schemas'
import { categoryGroups, unmappedCategoryGroup } from './category-groups'

const amount = z.number().finite().nonnegative().max(1_000_000_000).nullable()
const percent = z.number().finite().min(0).max(100).nullable()

/** Versioned independently of the UI so future alert jobs can use the same rules. */
export const listingFiltersSchema = z.object({
  version: z.literal(1),
  query: z.string().trim().max(200),
  categoryGroup: z.string().max(80).refine((value) => value === '' || value === unmappedCategoryGroup.id || categoryGroups.some((group) => group.id === value), 'Unknown category group').default(''),
  category: z.string().max(200),
  manufacturer: z.string().max(200),
  sourceId: z.string().max(100),
  stock: z.enum(['all', 'in', 'out']),
  minPrice: amount,
  maxPrice: amount,
  minDiscountAmount: amount,
  maxDiscountAmount: amount,
  minDiscountPercent: percent,
  maxDiscountPercent: percent,
}).superRefine((filters, context) => {
  for (const [minKey, maxKey] of [
    ['minPrice', 'maxPrice'], ['minDiscountAmount', 'maxDiscountAmount'], ['minDiscountPercent', 'maxDiscountPercent'],
  ] as const) {
    const min = filters[minKey]
    const max = filters[maxKey]
    if (min !== null && max !== null && min > max) context.addIssue({ code: 'custom', path: [maxKey], message: 'Maximum must be at least the minimum' })
  }
})

export type ListingFilters = z.output<typeof listingFiltersSchema>
export const emptyListingFilters: ListingFilters = {
  version: 1, query: '', categoryGroup: '', category: '', manufacturer: '', sourceId: '', stock: 'all',
  minPrice: null, maxPrice: null, minDiscountAmount: null, maxDiscountAmount: null,
  minDiscountPercent: null, maxDiscountPercent: null,
}

export function listingDiscount(listing: Pick<CurrentListing, 'price' | 'compareAtPrice'>) {
  const price = Number(listing.price)
  const compareAt = Number(listing.compareAtPrice)
  if (listing.price === null || listing.compareAtPrice === null || !Number.isFinite(price) || !Number.isFinite(compareAt) || compareAt <= price) return null
  return { amount: compareAt - price, percent: (compareAt - price) / compareAt * 100 }
}

export function matchesListingFilters(listing: CurrentListing, filters: ListingFilters): boolean {
  const needle = filters.query.toLowerCase()
  if (needle && ![listing.productTitle, listing.variantTitle, listing.manufacturer, listing.category, listing.sourceName, listing.moduleId, listing.sku, ...listing.tags].some((value) => value?.toLowerCase().includes(needle))) return false
  if (filters.categoryGroup && listing.categoryGroup !== filters.categoryGroup) return false
  if (filters.category && listing.category !== filters.category) return false
  if (filters.manufacturer && listing.manufacturer !== filters.manufacturer) return false
  if (filters.sourceId && listing.sourceId !== filters.sourceId) return false
  if (filters.stock !== 'all' && listing.available !== (filters.stock === 'in')) return false
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    if (listing.price === null) return false
    const price = Number(listing.price)
    if (!Number.isFinite(price) || (filters.minPrice !== null && price < filters.minPrice) || (filters.maxPrice !== null && price > filters.maxPrice)) return false
  }
  if (filters.minDiscountAmount !== null || filters.maxDiscountAmount !== null || filters.minDiscountPercent !== null || filters.maxDiscountPercent !== null) {
    const discount = listingDiscount(listing)
    if (!discount) return false
    if (filters.minDiscountAmount !== null && discount.amount < filters.minDiscountAmount) return false
    if (filters.maxDiscountAmount !== null && discount.amount > filters.maxDiscountAmount) return false
    if (filters.minDiscountPercent !== null && discount.percent < filters.minDiscountPercent) return false
    if (filters.maxDiscountPercent !== null && discount.percent > filters.maxDiscountPercent) return false
  }
  return true
}
