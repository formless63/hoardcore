import { z } from 'zod'
import type { NormalizedCatalogRecord } from '../types'

// Shopify storefronts commonly emit empty strings or null for optional
// metadata. Treat those as absent without weakening required identity fields.
const optionalText = z.string().trim().nullish().transform((value) => value || undefined)
const optionalUrl = z.string().trim().nullish().transform((value) => value || undefined).pipe(z.url().optional())

/** The deliberately small subset of Shopify's collection JSON we consume. */
export const shopifyVariantSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: optionalText,
  sku: optionalText,
  barcode: optionalText,
  price: z.union([z.string(), z.number()]).optional(),
  compare_at_price: z.union([z.string(), z.number()]).nullable().optional(),
  available: z.boolean().optional(),
  inventory_quantity: z.number().int().nullable().optional(),
  featured_image: z.object({ src: optionalUrl }).nullable().optional(),
})

export const shopifyImageSchema = z.object({ src: optionalUrl })

export const shopifyProductSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string().trim().min(1),
  handle: z.string().trim().min(1),
  body_html: optionalText,
  vendor: optionalText,
  product_type: optionalText,
  tags: z.union([z.string(), z.array(z.string())]).nullish(),
  published_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  available: z.boolean().optional(),
  variants: z.array(shopifyVariantSchema).min(1),
  images: z.array(shopifyImageSchema).nullish(),
})

export const shopifyCollectionResponseSchema = z.object({
  products: z.array(shopifyProductSchema),
})

export type ShopifyProduct = z.output<typeof shopifyProductSchema>
export type ShopifyCollectionResponse = z.output<typeof shopifyCollectionResponseSchema>

export interface ShopifyCollectionContext {
  /** The registered Hoardcore source instance/scope, never a global Shopify ID. */
  sourceKey: string
  baseUrl: string
  observedAt?: string
  currency?: string
}

export function parseShopifyCollection(input: unknown): ShopifyCollectionResponse {
  return shopifyCollectionResponseSchema.parse(input)
}

function money(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function cleanDescription(value: string | undefined): string | undefined {
  if (!value) return undefined
  const text = value.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim()
  return text || undefined
}

function imageFor(product: ShopifyProduct, variant: ShopifyProduct['variants'][number]): string | undefined {
  return variant.featured_image?.src ?? product.images?.[0]?.src
}

/** Maps source-native records to one shared record per product variant listing. */
export function normalizeShopifyCollection(
  response: ShopifyCollectionResponse,
  context: ShopifyCollectionContext,
): NormalizedCatalogRecord[] {
  const storefrontOrigin = new URL(context.baseUrl).origin
  return response.products.flatMap((product) => {
    // Product identity is storefront-scoped; a collection registration is only a listing scope.
    const storefrontKey = new URL(context.baseUrl).host.toLowerCase()
    const productKey = `shopify:${storefrontKey}:product:${product.id}`
    const imageUrls = [...new Set([
      ...(product.images ?? []).map((image) => image.src),
      ...product.variants.map((variant) => variant.featured_image?.src),
    ].filter((url): url is string => Boolean(url)))]
    return product.variants.map((variant) => {
      const variantKey = `${productKey}:variant:${variant.id}`
      const imageUrl = imageFor(product, variant)
      const available = variant.available ?? product.available ?? false
      const price = money(variant.price)
      const compareAtPrice = money(variant.compare_at_price ?? undefined)
      return {
        product: {
          productKey,
          title: product.title,
          description: cleanDescription(product.body_html),
          brand: product.vendor,
          productType: product.product_type,
          tags: Array.isArray(product.tags)
            ? product.tags.map((tag) => tag.trim()).filter(Boolean)
            : (product.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
          imageUrls,
        },
        variant: {
          variantKey,
          productKey,
          title: variant.title,
          sku: variant.sku,
          barcode: variant.barcode,
          price,
          compareAtPrice,
          ...(context.currency ? { currency: context.currency } : {}),
          available,
          imageUrl,
        },
        listing: {
          listingKey: `${context.sourceKey}:${variantKey}`,
          sourceKey: context.sourceKey,
          productKey,
          variantKey,
          url: `${storefrontOrigin}/products/${product.handle}?variant=${variant.id}`,
          imageUrl,
          current: { title: product.title, price, compareAtPrice, ...(context.currency ? { currency: context.currency } : {}), available, stockQuantity: variant.inventory_quantity ?? undefined },
          observedAt: context.observedAt,
        },
      } satisfies NormalizedCatalogRecord
    })
  })
}
