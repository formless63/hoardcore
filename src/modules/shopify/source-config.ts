import type { NormalizedSourceConfig } from '../types'
import { isIpLiteral, isPublicShopifyAddress } from './network'
import { normalizeCurrency } from '../../lib/currency'

export const shopifyCollectionPolicyDefaults = {
  minimumDelayMs: 1000, maxRequests: 3, maxRetries: 2, backoffBaseMs: 1000,
  userAgent: 'Hoardcore/0.1 (conservative catalog collector)',
} as const

export function normalizeShopifyCatalogUrl(value: string, currency?: unknown): NormalizedSourceConfig {
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

  if (url.port && url.port !== '443') {
    throw new Error('Catalog URL must use HTTPS port 443')
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
    throw new Error('Catalog URL cannot use a loopback or private-network host')
  }
  if (isIpLiteral(url.hostname)) {
    const literal = url.hostname.replace(/^\[|\]$/gu, '')
    const family = literal.includes(':') ? 6 : 4
    if (!isPublicShopifyAddress(literal, family)) throw new Error('Catalog URL cannot use a loopback or private-network host')
  }

  const pathname = url.pathname.replace(/\/+$/u, '') || '/'
  const collectionMatch = pathname.match(/^\/collections\/([^/]+)$/u)

  if (pathname !== '/' && !collectionMatch) {
    throw new Error('Use a Shopify storefront homepage or a single collection URL')
  }

  const scopePath = collectionMatch ? `/collections/${collectionMatch[1]}` : ''
  const host = url.host.toLowerCase()
  const catalogUrl = scopePath ? `https://${host}${scopePath}` : `https://${host}/`

  const normalizedCurrency = normalizeCurrency(currency)
  return {
    config: { catalogUrl, ...(normalizedCurrency ? { currency: normalizedCurrency } : {}), ...shopifyCollectionPolicyDefaults },
    sourceKey: `${host}${scopePath}`,
    summary: `${host}${scopePath}`,
  }
}
