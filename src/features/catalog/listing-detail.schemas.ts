import { z } from 'zod'

const optionalText = z.string().nullable()

export const listingObservationSchema = z.object({
  id: z.string(), observedAt: z.date(), title: z.string(), price: optionalText, compareAtPrice: optionalText,
  currency: optionalText, available: z.boolean(),
  evidence: z.object({
    id: z.string(), capturedAt: z.date(), contentType: optionalText,
    sha256: optionalText,
    run: z.object({ id: z.string(), status: z.string(), requestCount: z.string(), error: optionalText, createdAt: z.date(), startedAt: z.date().nullable(), completedAt: z.date().nullable() }).nullable(),
  }).nullable(),
})

export const listingDetailSchema = z.object({
  id: z.string(), url: z.string(), imageUrl: optionalText,
  mediaCaptures: z.array(z.object({ id: z.string(), listingId: z.string(), sourceUrl: z.string(), capturedAt: z.date() })),
  source: z.object({ id: z.string(), displayName: z.string(), moduleId: z.string() }),
  product: z.object({ id: z.string(), title: z.string(), description: optionalText, brand: optionalText, productType: optionalText, tags: z.array(z.string()), imageUrls: z.array(z.string()) }),
  variant: z.object({ id: z.string(), title: optionalText, sku: optionalText, barcode: optionalText }),
  current: z.object({ title: z.string(), price: optionalText, compareAtPrice: optionalText, currency: optionalText, available: z.boolean(), observedAt: z.date() }),
  observations: z.array(listingObservationSchema),
})

export type ListingDetail = z.output<typeof listingDetailSchema>
