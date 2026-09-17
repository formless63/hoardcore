import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { listCurrentCatalogListings, listCurrentCatalogListingsPage } from '~/server/db/catalog-persistence.server'
import { currentListingsPageInputSchema, currentListingsPageResponseSchema, currentListingsResponseSchema } from './catalog.schemas'
import { z } from 'zod'
import { createResearchBatchExport } from '~/features/research/research.batch'
import { persistResearchBatchExport } from '~/features/research/research.server'
import { loadResearchExportRows } from '~/server/db/catalog-research-export.server'

export const listCurrentListings = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  const listings = await listCurrentCatalogListings(getDatabase())
  return currentListingsResponseSchema.parse({ listings })
})

/** Paginated workbench query. Use this for route loaders; the legacy full-list
 * function remains only while callers migrate. */
export const listCurrentListingsPage = createServerFn({ method: 'GET' })
  .validator(currentListingsPageInputSchema)
  .handler(async ({ data }) => {
    await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return currentListingsPageResponseSchema.parse(await listCurrentCatalogListingsPage(getDatabase(), data))
  })

export const createResearchExport = createServerFn({ method: 'POST' })
  .validator(z.object({ listingIds: z.array(z.uuid()).min(1).max(100), persist: z.boolean().default(true) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    const rows = await loadResearchExportRows(getDatabase(), data.listingIds)
    const records = rows.map((row) => ({
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
      evidenceId: row.evidenceId ?? undefined,
    }))
    const exported = createResearchBatchExport(records)
    // Route preloading may request a draft packet. Only an explicit export or
    // save action should create an immutable research batch.
    return data.persist ? persistResearchBatchExport(getDatabase(), session.user.id, exported) : exported
  })
