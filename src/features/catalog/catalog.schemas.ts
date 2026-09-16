import { z } from 'zod'

export const currentListingSchema = z.object({
  id: z.string(), url: z.string(), sourceId: z.string(), sourceName: z.string(), moduleId: z.string(),
  productId: z.string(), productTitle: z.string(), variantId: z.string(), variantTitle: z.string().nullable(),
  sku: z.string().nullable(), title: z.string(), price: z.string().nullable(), currency: z.string().nullable(),
  available: z.boolean(), observedAt: z.date(),
})
export const currentListingsResponseSchema = z.object({ listings: z.array(currentListingSchema) })
export type CurrentListing = z.infer<typeof currentListingSchema>
