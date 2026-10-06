import { lookup as lookupDns } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import type { RequestOptions } from 'node:https'
import type { ShopifyHttpClient, ShopifyHttpResponse } from './transport'
import { isPublicShopifyAddress } from './network'
import { requestSourceHttps, sourceRequestOptions } from '~/lib/source-http.server'
import type { SourceProxy } from '~/features/sources/source-routing.schemas'

export type ShopifyResolver = (hostname: string) => Promise<LookupAddress[]>
export type ShopifyPinnedRequest = (options: RequestOptions) => Promise<ShopifyHttpResponse>

export async function resolvePublicShopifyAddress(hostname: string, resolver: ShopifyResolver = (name) => lookupDns(name, { all: true, order: 'verbatim' })) {
  const addresses = await resolver(hostname)
  if (!addresses.length || addresses.some(({ address, family }) => !isPublicShopifyAddress(address, family))) {
    throw new Error('Shopify source did not resolve exclusively to public addresses')
  }
  return addresses[0]!
}

/**
 * Resolve and validate every address immediately before connection, then pin
 * Node's HTTPS lookup to that checked address. `https.request` does not follow
 * redirects, so a source cannot use DNS rebinding or a redirect hop to pivot
 * the collector into an internal network.
 */
export function createSecureShopifyHttpClient(dependencies: { resolver?: ShopifyResolver; request?: ShopifyPinnedRequest; proxy?: SourceProxy } = {}): ShopifyHttpClient {
  return async (input, init) => {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') {
      throw new Error('Shopify source request must use credential-free HTTPS on port 443')
    }
    const pinned = await resolvePublicShopifyAddress(url.hostname, dependencies.resolver)
    const options = sourceRequestOptions(url, pinned, init, dependencies.proxy)
    return dependencies.request ? dependencies.request(options) : requestSourceHttps(options, Boolean(dependencies.proxy))
  }
}
