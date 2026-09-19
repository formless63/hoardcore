import { z } from 'zod'

/** Shopify-hosted images commonly use this CDN. It remains module knowledge. */
const shopifyMediaConfigSchema = z.object({
  catalogUrl: z.url(),
  mediaAllowedHosts: z.array(z.string().trim().min(1)).max(20).optional(),
  robotsPolicy: z.enum(['respect', 'operator_approved']).default('respect'),
})

export function usesOperatorApprovedShopifyAccess(config: unknown): boolean {
  return shopifyMediaConfigSchema.parse(config).robotsPolicy === 'operator_approved'
}

export function allowedShopifyMediaHosts(config: unknown): ReadonlySet<string> {
  const parsed = shopifyMediaConfigSchema.parse(config)
  const catalogHost = new URL(parsed.catalogUrl).hostname.toLowerCase()
  return new Set([catalogHost, 'cdn.shopify.com', ...(parsed.mediaAllowedHosts ?? []).map((host) => host.toLowerCase())])
}

export function isAllowedShopifyMediaUrl(config: unknown, value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    return allowedShopifyMediaHosts(config).has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}
