import { z } from 'zod'
import { listingFiltersSchema } from './listing-filters'
import { listingPresentationSchema } from './listing-workbench-state'

export const currentListingSchema = z.object({
  id: z.string(), url: z.string(), sourceId: z.string(), sourceName: z.string(), moduleId: z.string(),
  productId: z.string(), productTitle: z.string(), manufacturer: z.string().nullable(), category: z.string().nullable(), categoryGroup: z.string(), tags: z.array(z.string()),
  variantId: z.string(), variantTitle: z.string().nullable(), sku: z.string().nullable(), imageUrl: z.string().nullable(),
  mediaCaptureId: z.string().nullish(),
  title: z.string(), price: z.string().nullable(), compareAtPrice: z.string().nullable(), currency: z.string().nullable(),
  available: z.boolean(), stockQuantity: z.number().int().nullable(), observedAt: z.date(),
})
export const currentListingsResponseSchema = z.object({ listings: z.array(currentListingSchema) })
export type CurrentListing = z.infer<typeof currentListingSchema>

/**
 * The durable query contract for the listings workbench. Keep this separate
 * from presentation components so a route never needs to hydrate a whole
 * catalog merely to show one page.
 */
export const currentListingsPageInputSchema = z.object({
  filters: listingFiltersSchema,
  sorting: listingPresentationSchema.shape.sorting,
  page: z.number().int().nonnegative(),
  pageSize: listingPresentationSchema.shape.pageSize,
})

export const currentListingsFacetsSchema = z.object({
  categories: z.array(z.object({ value: z.string(), categoryGroups: z.array(z.string()), count: z.number().int().positive() })),
  manufacturers: z.array(z.string()),
  sources: z.array(z.object({ id: z.string(), name: z.string() })),
  categoryGroupCounts: z.record(z.string(), z.number().int().nonnegative()),
})

export const currentListingsPageResponseSchema = z.object({
  listings: z.array(currentListingSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  pageSize: listingPresentationSchema.shape.pageSize,
  pageCount: z.number().int().positive(),
  facets: currentListingsFacetsSchema,
})

export type CurrentListingsPageInput = z.output<typeof currentListingsPageInputSchema>
export type CurrentListingsPage = z.infer<typeof currentListingsPageResponseSchema>
