import type { NormalizedCatalogRecord } from '../../modules/types'
import { eq } from 'drizzle-orm'
import { catalogProducts, catalogVariants, collectionRuns, sourceEvidence, sourceListingCurrent, sourceListingObservations, sourceListings } from './schema/catalog'
import { catalogSources } from './schema/catalog-sources'
import type { Database } from './db.server'
import { getListingMediaCaptures } from '~/features/media/media.server'

export interface CatalogObservationInput {
  observedAt?: Date
  evidence?: { payload: unknown; contentType?: string; sha256?: string }
  runId?: string
}

export async function listCurrentCatalogListings(db: Database) {
  const listings = await db.select({
    id: sourceListings.id,
    url: sourceListings.url,
    sourceId: catalogSources.id,
    sourceName: catalogSources.displayName,
    moduleId: catalogSources.moduleId,
    productId: catalogProducts.id,
    productTitle: catalogProducts.title,
    manufacturer: catalogProducts.brand,
    category: catalogProducts.productType,
    tags: catalogProducts.tags,
    variantId: catalogVariants.id,
    variantTitle: catalogVariants.title,
    sku: catalogVariants.sku,
    imageUrl: sourceListings.imageUrl,
    title: sourceListingCurrent.title,
    price: sourceListingCurrent.price,
    compareAtPrice: sourceListingCurrent.compareAtPrice,
    currency: sourceListingCurrent.currency,
    available: sourceListingCurrent.available,
    observedAt: sourceListingCurrent.observedAt,
  }).from(sourceListingCurrent)
    .innerJoin(sourceListings, eq(sourceListings.id, sourceListingCurrent.listingId))
    .innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
    .innerJoin(catalogVariants, eq(catalogVariants.id, sourceListings.variantId))
  const captures = await getListingMediaCaptures(db, listings.map((listing) => listing.id))
  return listings.map((listing) => ({ ...listing, mediaCaptureId: captures.get(listing.id)?.id ?? null }))
}

/** Atomically reconciles current catalog state while retaining every supplied observation. */
export async function persistCatalogSnapshot(
  db: Database,
  sourceId: string,
  records: readonly NormalizedCatalogRecord[],
  input: CatalogObservationInput = {},
) {
  const observedAt = input.observedAt ?? new Date()
  return db.transaction(async (tx) => {
    const persisted = []
    let evidenceId: string | undefined
    if (input.evidence && input.runId) {
      const [evidence] = await tx.insert(sourceEvidence)
        .values({ sourceId, runId: input.runId, capturedAt: observedAt, ...input.evidence })
        .onConflictDoUpdate({
          target: sourceEvidence.runId,
          set: { capturedAt: observedAt, ...input.evidence },
        })
        .returning({ id: sourceEvidence.id })
      evidenceId = evidence.id
    }
    for (const record of records) {
      const [product] = await tx.insert(catalogProducts).values({
        productKey: record.product.productKey,
        title: record.product.title,
        description: record.product.description,
        brand: record.product.brand,
        productType: record.product.productType,
        tags: record.product.tags,
        imageUrls: record.product.imageUrls ?? [],
        updatedAt: observedAt,
      }).onConflictDoUpdate({ target: catalogProducts.productKey, set: {
        title: record.product.title, description: record.product.description, brand: record.product.brand,
        productType: record.product.productType, tags: record.product.tags,
        ...(record.product.imageUrls !== undefined ? { imageUrls: record.product.imageUrls } : {}), updatedAt: observedAt,
      } }).returning({ id: catalogProducts.id })
      const [variant] = await tx.insert(catalogVariants).values({
        productId: product.id, variantKey: record.variant.variantKey, title: record.variant.title,
        sku: record.variant.sku, barcode: record.variant.barcode, updatedAt: observedAt,
      }).onConflictDoUpdate({ target: catalogVariants.variantKey, set: {
        productId: product.id, title: record.variant.title, sku: record.variant.sku, barcode: record.variant.barcode, updatedAt: observedAt,
      } }).returning({ id: catalogVariants.id })
      const [listing] = await tx.insert(sourceListings).values({
        sourceId, productId: product.id, variantId: variant.id, listingKey: record.listing.listingKey,
        url: record.listing.url, imageUrl: record.listing.imageUrl, updatedAt: observedAt,
      }).onConflictDoUpdate({ target: sourceListings.listingKey, set: {
        sourceId, productId: product.id, variantId: variant.id, url: record.listing.url, imageUrl: record.listing.imageUrl, updatedAt: observedAt,
      } }).returning({ id: sourceListings.id })
      await tx.insert(sourceListingObservations).values({
        listingId: listing.id, observedAt, title: record.listing.current.title, price: record.listing.current.price?.toFixed(2),
        compareAtPrice: record.listing.current.compareAtPrice?.toFixed(2),
        currency: record.listing.current.currency, available: record.listing.current.available, evidenceId,
      }).onConflictDoNothing({ target: [sourceListingObservations.listingId, sourceListingObservations.evidenceId] })
      await tx.insert(sourceListingCurrent).values({
        listingId: listing.id, observedAt, title: record.listing.current.title, price: record.listing.current.price?.toFixed(2),
        compareAtPrice: record.listing.current.compareAtPrice?.toFixed(2),
        currency: record.listing.current.currency, available: record.listing.current.available, updatedAt: observedAt,
      }).onConflictDoUpdate({ target: sourceListingCurrent.listingId, set: {
        observedAt, title: record.listing.current.title, price: record.listing.current.price?.toFixed(2),
        compareAtPrice: record.listing.current.compareAtPrice?.toFixed(2),
        currency: record.listing.current.currency, available: record.listing.current.available, updatedAt: observedAt,
      } })
      persisted.push({ productId: product.id, variantId: variant.id, listingId: listing.id })
    }
    return persisted
  })
}
