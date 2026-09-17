import { lookup as lookupDns } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { Readable } from 'node:stream'
import type { ShopifyHttpClient, ShopifyHttpResponse } from './transport'
import { isPublicShopifyAddress } from './network'
import { createPinnedLookup } from '~/lib/pinned-lookup'

export type ShopifyResolver = (hostname: string) => Promise<LookupAddress[]>
export type ShopifyPinnedRequest = (options: RequestOptions) => Promise<ShopifyHttpResponse>

export async function resolvePublicShopifyAddress(hostname: string, resolver: ShopifyResolver = (name) => lookupDns(name, { all: true, order: 'verbatim' })) {
  const addresses = await resolver(hostname)
  if (!addresses.length || addresses.some(({ address, family }) => !isPublicShopifyAddress(address, family))) {
    throw new Error('Shopify source did not resolve exclusively to public addresses')
  }
  return addresses[0]!
}

function requestPinnedShopify(options: RequestOptions): Promise<ShopifyHttpResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(options, (incoming) => {
      const status = incoming.statusCode ?? 0
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, item)
        else if (value !== undefined) headers.set(name, value)
      }
      const body = status === 204 || status === 304 ? null : Readable.toWeb(incoming) as unknown as BodyInit
      resolve(new Response(body, { status, headers }))
    })
    request.once('error', reject)
    request.end()
  })
}

/**
 * Resolve and validate every address immediately before connection, then pin
 * Node's HTTPS lookup to that checked address. `https.request` does not follow
 * redirects, so a source cannot use DNS rebinding or a redirect hop to pivot
 * the collector into an internal network.
 */
export function createSecureShopifyHttpClient(dependencies: { resolver?: ShopifyResolver; request?: ShopifyPinnedRequest } = {}): ShopifyHttpClient {
  return async (input, init) => {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') {
      throw new Error('Shopify source request must use credential-free HTTPS on port 443')
    }
    const pinned = await resolvePublicShopifyAddress(url.hostname, dependencies.resolver)
    return (dependencies.request ?? requestPinnedShopify)({
      protocol: 'https:', hostname: url.hostname, servername: url.hostname, port: 443,
      path: `${url.pathname}${url.search}`, method: 'GET', headers: init.headers,
      lookup: createPinnedLookup(pinned), signal: init.signal,
    })
  }
}
