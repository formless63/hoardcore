import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { Readable } from 'node:stream'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { isPublicNetworkAddress } from './public-network-address'
import { createPinnedLookup } from './pinned-lookup'
import { proxyEndpointSchema, type SourceProxy } from '~/features/sources/source-routing.schemas'

export type SourceResolver = (hostname: string) => Promise<LookupAddress[]>

export async function resolvePublicSourceAddress(hostname: string, resolver: SourceResolver = name => lookup(name, { all: true, order: 'verbatim' })) {
  const addresses = await resolver(hostname)
  if (!addresses.length || addresses.some(({ address, family }) => !isPublicNetworkAddress(address, family)))
    throw new Error('Source did not resolve exclusively to public addresses')
  return addresses[0]!
}

export function sourceRequestOptions(url: URL, pinned: LookupAddress, init: RequestInit, proxy?: SourceProxy): RequestOptions {
  const headers = Object.fromEntries(new Headers(init.headers))
  // Proxy credentials belong only on CONNECT, never on the origin request.
  delete headers['proxy-authorization']
  headers.host = url.host
  const agent = proxy ? new HttpsProxyAgent(proxyEndpointSchema.parse(proxy.endpoint), {
    keepAlive: false,
    headers: proxy.username || proxy.password ? { 'Proxy-Authorization': `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}` } : {},
  }) : undefined
  return {
    protocol: 'https:', hostname: proxy ? pinned.address : url.hostname,
    servername: url.hostname, port: 443, path: `${url.pathname}${url.search}`,
    method: 'GET', headers, signal: init.signal ?? undefined,
    lookup: createPinnedLookup(pinned), agent,
  }
}

export function requestSourceHttps(options: RequestOptions, proxied = false): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(options, incoming => {
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, item)
        else if (value !== undefined) headers.set(name, value)
      }
      const status = incoming.statusCode ?? 0
      const body = status === 204 || status === 304 ? null : Readable.toWeb(incoming) as unknown as BodyInit
      resolve(new Response(body, { status, headers }))
    })
    request.on('proxyConnect', (response: { statusCode: number }) => {
      if (response.statusCode !== 200) request.destroy(new Error('Configured source proxy rejected the connection'))
    })
    request.once('error', (error: Error) => {
      if (!proxied) { reject(error); return }
      const sanitized = new Error('Configured source proxy connection failed; no direct fallback')
      sanitized.name = ['AbortError', 'TimeoutError'].includes(error.name) ? error.name : 'Error'
      reject(sanitized)
    })
    request.end()
  })
}

/** DNS pinned CONNECT target, origin TLS/Host preserved, no redirect following. */
export function createSourceHttpClient(proxy?: SourceProxy, resolver?: SourceResolver) {
  return async (input: string, init: RequestInit): Promise<Response> => {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443')
      throw new Error('Source request must use credential-free HTTPS on port 443')
    const pinned = await resolvePublicSourceAddress(url.hostname, resolver)
    return requestSourceHttps(sourceRequestOptions(url, pinned, init, proxy), Boolean(proxy))
  }
}
