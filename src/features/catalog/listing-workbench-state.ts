import { z } from 'zod'
import { emptyListingFilters, listingFiltersSchema } from './listing-filters'

export const listingPresentationSchema = z.object({
  sorting: z.array(z.object({ id: z.string().min(1).max(80), desc: z.boolean() })).max(3).catch([]).default([]),
  pageSize: z.union([z.literal(50), z.literal(100), z.literal(200)]).catch(50).default(50),
})

export const defaultListingPresentation: z.output<typeof listingPresentationSchema> = { sorting: [], pageSize: 50 }

export const listingWorkbenchSearchSchema = z.object({
  filters: listingFiltersSchema.catch(emptyListingFilters).default(emptyListingFilters),
  sorting: listingPresentationSchema.shape.sorting,
  page: z.number().int().nonnegative().catch(0).default(0),
  pageSize: listingPresentationSchema.shape.pageSize,
})
