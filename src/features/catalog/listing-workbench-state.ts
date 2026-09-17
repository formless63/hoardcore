import { z } from 'zod'
import { emptyListingFilters, listingFiltersSchema } from './listing-filters'

export const listingWorkbenchSearchSchema = z.object({
  filters: listingFiltersSchema.catch(emptyListingFilters).default(emptyListingFilters),
  sorting: z.array(z.object({ id: z.string(), desc: z.boolean() })).catch([]).default([]),
  page: z.number().int().nonnegative().catch(0).default(0),
  pageSize: z.union([z.literal(50), z.literal(100), z.literal(200)]).catch(50).default(50),
})
