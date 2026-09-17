import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import {
  catalogProducts,
  catalogSources,
  catalogVariants,
  listingMedia,
  mediaBlobs,
  sourceListings,
} from '~/server/db/schema'
import {
  getAuthenticatedMediaVariant,
  getListingMediaCaptures,
  getProductMediaGallery,
  persistListingMedia,
  reuseListingMedia,
} from './media.server'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip

describeWithDatabase('captured listing media persistence', () => {
  const sourceId = crypto.randomUUID()
  const productId = crypto.randomUUID()
  const firstVariantId = crypto.randomUUID()
  const secondVariantId = crypto.randomUUID()
  const firstListingId = crypto.randomUUID()
  const secondListingId = crypto.randomUUID()
  const blobIds = new Set<string>()
  const now = new Date('2026-09-16T21:00:00.000Z')
  const sourceBytes = Buffer.from('fixture-source-image-bytes')
  const thumbnail = { data: Buffer.from('fixture-thumbnail-webp'), contentType: 'image/webp' as const, width: 96, height: 72 }
  const preview = { data: Buffer.from('fixture-preview-webp'), contentType: 'image/webp' as const, width: 480, height: 360 }
  const rememberBlobs = <T extends { thumbnailBlobId: string; previewBlobId: string }>(capture: T): T => {
    blobIds.add(capture.thumbnailBlobId)
    blobIds.add(capture.previewBlobId)
    return capture
  }

  beforeAll(async () => {
    const db = getDatabase()
    await db.insert(catalogSources).values({
      id: sourceId, moduleId: 'shopify', displayName: 'Media fixture source', sourceKey: `media-fixture-${sourceId}`,
      config: { catalogUrl: 'https://fixture.example/collections/media' },
    })
    await db.insert(catalogProducts).values({
      id: productId, productKey: `media-fixture-product-${productId}`, title: 'Media fixture product', imageUrls: [
        'https://cdn.shopify.com/fixture-one.jpg', 'https://cdn.shopify.com/fixture-two.jpg',
      ],
    })
    await db.insert(catalogVariants).values([
      { id: firstVariantId, productId, variantKey: `media-fixture-variant-${firstVariantId}`, title: 'First' },
      { id: secondVariantId, productId, variantKey: `media-fixture-variant-${secondVariantId}`, title: 'Second' },
    ])
    await db.insert(sourceListings).values([
      { id: firstListingId, sourceId, productId, variantId: firstVariantId, listingKey: `media-fixture-listing-${firstListingId}`, url: 'https://fixture.example/products/one', imageUrl: 'https://cdn.shopify.com/fixture-one.jpg' },
      { id: secondListingId, sourceId, productId, variantId: secondVariantId, listingKey: `media-fixture-listing-${secondListingId}`, url: 'https://fixture.example/products/two', imageUrl: 'https://cdn.shopify.com/fixture-two.jpg' },
    ])
  })

  afterAll(async () => {
    const db = getDatabase()
    // Deleting the source cascades listing media; blobs intentionally do not
    // cascade because production blobs can be shared by captures.
    await db.delete(catalogSources).where(eq(catalogSources.id, sourceId))
    if (blobIds.size) await db.delete(mediaBlobs).where(inArray(mediaBlobs.id, [...blobIds]))
    await db.delete(catalogVariants).where(inArray(catalogVariants.id, [firstVariantId, secondVariantId]))
    await db.delete(catalogProducts).where(eq(catalogProducts.id, productId))
    await closeDatabase()
  })

  it('deduplicates derivative blobs while retaining a per-listing captured gallery', async () => {
    const db = getDatabase()
    const first = rememberBlobs(await persistListingMedia(db, {
      listingId: firstListingId, sourceUrl: 'https://cdn.shopify.com/fixture-one.jpg', sourceBytes,
      sourceContentType: 'image/jpeg', originalWidth: 1200, originalHeight: 900, thumbnail, preview, capturedAt: now,
    }))
    const secondPhoto = rememberBlobs(await persistListingMedia(db, {
      listingId: firstListingId, sourceUrl: 'https://cdn.shopify.com/fixture-two.jpg', sourceBytes,
      sourceContentType: 'image/jpeg', originalWidth: 1200, originalHeight: 900, thumbnail, preview, capturedAt: new Date(now.getTime() + 1_000),
    }))
    const sibling = rememberBlobs(await persistListingMedia(db, {
      listingId: secondListingId, sourceUrl: 'https://cdn.shopify.com/fixture-two.jpg', sourceBytes,
      sourceContentType: 'image/jpeg', originalWidth: 1200, originalHeight: 900, thumbnail, preview, capturedAt: new Date(now.getTime() + 2_000),
    }))

    const blobs = await db.select().from(mediaBlobs).where(inArray(mediaBlobs.id, [...blobIds]))
    expect(blobs).toHaveLength(2)
    expect(blobs.map((blob) => blob.data.toString()).sort()).toEqual(['fixture-preview-webp', 'fixture-thumbnail-webp'])

    const gallery = await getProductMediaGallery(db, firstListingId)
    expect(gallery).toHaveLength(2)
    expect(gallery.map((capture) => capture.id)).toEqual([first.id, sibling.id])

    const capturedByListing = await getListingMediaCaptures(db, [firstListingId, secondListingId])
    expect(capturedByListing.get(firstListingId)?.id).toBe(first.id)
    expect(capturedByListing.get(secondListingId)?.id).toBe(sibling.id)

    const privateThumbnail = await getAuthenticatedMediaVariant(db, first.id, 'thumbnail')
    expect(privateThumbnail).toMatchObject({ contentType: 'image/webp' })
    expect(privateThumbnail?.data.toString()).toBe('fixture-thumbnail-webp')
    await expect(getAuthenticatedMediaVariant(db, crypto.randomUUID(), 'preview')).resolves.toBeNull()

    const captureRows = await db.select().from(listingMedia).where(inArray(listingMedia.id, [first.id, secondPhoto.id, sibling.id]))
    expect(captureRows).toHaveLength(3)

    const reused = await reuseListingMedia(db, secondListingId, 'https://cdn.shopify.com/fixture-one.jpg')
    expect(reused).toMatchObject({ thumbnailBlobId: first.thumbnailBlobId, previewBlobId: first.previewBlobId })
    expect(await db.select().from(mediaBlobs).where(inArray(mediaBlobs.id, [...blobIds]))).toHaveLength(2)
  })
})
