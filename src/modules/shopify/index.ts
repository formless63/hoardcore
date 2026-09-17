import { z } from 'zod'
import type { HoardcoreSourceModule } from '../types'
import { normalizeShopifyCatalogUrl, shopifyCollectionPolicyDefaults } from './source-config'
import { currencyCodeSchema } from '../../lib/currency'
export {
  normalizeShopifyCollection,
  parseShopifyCollection,
  shopifyCollectionResponseSchema,
  shopifyProductSchema,
  shopifyVariantSchema,
} from './contracts'
export type { ShopifyCollectionContext, ShopifyCollectionResponse, ShopifyProduct } from './contracts'
export { fetchShopifyCollectionPage, ShopifyCollectionTransportError } from './transport'
export type { ShopifyCacheEntry, ShopifyCollectionFetchResult, ShopifyHttpClient, ShopifyHttpResponse, ShopifyTransportOptions } from './transport'

export const shopifySourceConfigSchema = z.object({ catalogUrl: z.url(), currency: currencyCodeSchema.optional() }).extend({
  stockCardsEnabled: z.boolean().default(false),
  minimumDelayMs: z.number().int().nonnegative().default(shopifyCollectionPolicyDefaults.minimumDelayMs),
  maxRequests: z.number().int().positive().default(shopifyCollectionPolicyDefaults.maxRequests),
  maxRetries: z.number().int().nonnegative().default(shopifyCollectionPolicyDefaults.maxRetries),
  backoffBaseMs: z.number().int().nonnegative().default(shopifyCollectionPolicyDefaults.backoffBaseMs),
  userAgent: z.string().min(1).default(shopifyCollectionPolicyDefaults.userAgent),
})

export const shopifySourceInputSchema = z.object({
  catalogUrl: z
    .string()
    .trim()
    .min(1, 'Catalog URL is required')
    .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
    .pipe(z.url('Enter a valid Shopify storefront or collection URL')),
  currency: currencyCodeSchema.optional(),
  stockCardsEnabled: z.boolean().default(false),
})

export const shopifyModule = {
  manifest: {
    id: 'shopify',
    name: 'Shopify',
    description: 'Collect and normalize public Shopify catalog data.',
    status: 'experimental',
  },
  sourceRegistration: {
    inputSchema: shopifySourceInputSchema,
    normalize(input) {
      const parsed = shopifySourceInputSchema.parse(input)
      const normalized = normalizeShopifyCatalogUrl(parsed.catalogUrl, parsed.currency)
      return parsed.stockCardsEnabled
        ? { ...normalized, config: { ...normalized.config, stockCardsEnabled: true } }
        : normalized
    },
    read(config) {
      const parsed = shopifySourceConfigSchema.parse(config)
      const normalized = normalizeShopifyCatalogUrl(parsed.catalogUrl, parsed.currency)
      return { ...normalized, config: { ...normalized.config, ...parsed } }
    },
  },
} satisfies HoardcoreSourceModule<typeof shopifySourceInputSchema>

export type ShopifySourceInput = z.input<typeof shopifySourceInputSchema>

export const shopifyModuleManifest = shopifyModule.manifest
