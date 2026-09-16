import { z } from 'zod'
import type { HoardcoreSourceModule } from '../types'
import { normalizeShopifyCatalogUrl } from './source-config'

const shopifySourceConfigSchema = z.object({
  catalogUrl: z.url(),
})

export const shopifySourceInputSchema = z.object({
  catalogUrl: z
    .string()
    .trim()
    .min(1, 'Catalog URL is required')
    .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
    .pipe(z.url('Enter a valid Shopify storefront or collection URL')),
})

export const shopifyModule = {
  manifest: {
    id: 'shopify',
    name: 'Shopify',
    description: 'Collect and normalize public Shopify catalog data.',
    status: 'planned',
  },
  sourceRegistration: {
    inputSchema: shopifySourceInputSchema,
    normalize(input) {
      const parsed = shopifySourceInputSchema.parse(input)
      return normalizeShopifyCatalogUrl(parsed.catalogUrl)
    },
    read(config) {
      const parsed = shopifySourceConfigSchema.parse(config)
      return normalizeShopifyCatalogUrl(parsed.catalogUrl)
    },
  },
} satisfies HoardcoreSourceModule<typeof shopifySourceInputSchema>

export type ShopifySourceInput = z.input<typeof shopifySourceInputSchema>

export const shopifyModuleManifest = shopifyModule.manifest
