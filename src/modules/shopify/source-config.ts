import type { NormalizedSourceConfig } from '../types'

export function normalizeShopifyCatalogUrl(value: string): NormalizedSourceConfig {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    throw new Error('Catalog URL is required')
  }

  const candidate = /^https?:\/\//iu.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`
  let url: URL

  try {
    url = new URL(candidate)
  } catch {
    throw new Error('Enter a valid Shopify storefront or collection URL')
  }

  if (url.protocol !== 'https:') {
    throw new Error('Catalog URL must use HTTPS')
  }

  if (url.username || url.password) {
    throw new Error('Catalog URL cannot include credentials')
  }

  const pathname = url.pathname.replace(/\/+$/u, '') || '/'
  const collectionMatch = pathname.match(/^\/collections\/([^/]+)$/u)

  if (pathname !== '/' && !collectionMatch) {
    throw new Error('Use a Shopify storefront homepage or a single collection URL')
  }

  const scopePath = collectionMatch ? `/collections/${collectionMatch[1]}` : ''
  const host = url.host.toLowerCase()
  const catalogUrl = scopePath ? `https://${host}${scopePath}` : `https://${host}/`

  return {
    config: { catalogUrl },
    sourceKey: `${host}${scopePath}`,
    summary: `${host}${scopePath}`,
  }
}
