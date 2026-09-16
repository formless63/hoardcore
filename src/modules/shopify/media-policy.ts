import { z } from 'zod'

/**
 * Shopify-hosted images commonly use this CDN.  It remains module knowledge,
 * and every URL is still checked against robots.txt before acquisition.
 */
const shopifyMediaConfigSchema = z.object({
  catalogUrl: z.url(),
  mediaAllowedHosts: z.array(z.string().trim().min(1)).max(20).optional(),
})

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
