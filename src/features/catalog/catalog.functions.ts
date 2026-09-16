import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { listCurrentCatalogListings } from '~/server/db/catalog-persistence.server'
import { currentListingsResponseSchema } from './catalog.schemas'
import { z } from 'zod'
import { inArray, desc, eq } from 'drizzle-orm'
import { catalogProducts, catalogVariants, sourceEvidence, sourceListingCurrent, sourceListingObservations, sourceListings } from '~/server/db/schema/catalog'
import { catalogSources } from '~/server/db/schema/catalog-sources'
import { createResearchBatchExport } from '~/features/research/research.batch'

export const listCurrentListings = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  const listings = await listCurrentCatalogListings(getDatabase())
  return currentListingsResponseSchema.parse({ listings })
})

export const createResearchExport = createServerFn({ method: 'POST' })
  .validator(z.object({ listingIds: z.array(z.uuid()).min(1).max(100) }))
  .handler(async ({ data }) => {
    await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    const rows = await getDatabase().select({ listing: sourceListings, current: sourceListingCurrent, product: catalogProducts, variant: catalogVariants, source: catalogSources, evidence: sourceEvidence })
      .from(sourceListings).innerJoin(sourceListingCurrent, eq(sourceListingCurrent.listingId, sourceListings.id)).innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId)).innerJoin(catalogVariants, eq(catalogVariants.id, sourceListings.variantId)).innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId)).leftJoin(sourceListingObservations, eq(sourceListingObservations.listingId, sourceListings.id)).leftJoin(sourceEvidence, eq(sourceEvidence.id, sourceListingObservations.evidenceId)).where(inArray(sourceListings.id, data.listingIds)).orderBy(desc(sourceListingObservations.observedAt))
    const latest = new Map<string, typeof rows[number]>()
    for (const row of rows) if (!latest.has(row.listing.id)) latest.set(row.listing.id, row)
    if (latest.size !== data.listingIds.length) throw new Error('One or more selected listings are unavailable')
    const records = [...latest.values()].map((row) => ({
      product: {
        productKey: row.product.id, title: row.product.title, description: row.product.description ?? undefined,
        brand: row.product.brand ?? undefined, productType: row.product.productType ?? undefined,
        tags: row.product.tags, imageUrls: row.product.imageUrls,
      },
      variant: {
        variantKey: row.variant.id, productKey: row.product.id, title: row.variant.title ?? undefined,
        sku: row.variant.sku ?? undefined, barcode: row.variant.barcode ?? undefined,
        available: row.current.available, price: row.current.price ? Number(row.current.price) : undefined,
        compareAtPrice: row.current.compareAtPrice ? Number(row.current.compareAtPrice) : undefined,
        currency: row.current.currency ?? undefined,
      },
      listing: {
        listingKey: row.listing.id, sourceKey: row.source.sourceKey, productKey: row.product.id,
        variantKey: row.variant.id, url: row.listing.url, imageUrl: row.listing.imageUrl ?? undefined,
        current: {
          title: row.current.title, price: row.current.price ? Number(row.current.price) : undefined,
          compareAtPrice: row.current.compareAtPrice ? Number(row.current.compareAtPrice) : undefined,
          currency: row.current.currency ?? undefined, available: row.current.available,
        },
        observedAt: row.current.observedAt.toISOString(),
      },
      evidenceId: row.evidence?.id,
    }))
    return createResearchBatchExport(records)
  })
