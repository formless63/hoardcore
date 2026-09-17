import { lookup as lookupDns } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { isPublicNtfyAddress } from './ntfy-network'
import { createPinnedLookup } from '~/lib/pinned-lookup'

export interface NtfyFetchResponse { ok: boolean; status: number; text(): Promise<string> }
export type NtfyFetch = (input: string, init: RequestInit) => Promise<NtfyFetchResponse>
export type NtfyResolver = (hostname: string) => Promise<LookupAddress[]>
export type NtfyRequest = (options: RequestOptions, body: string) => Promise<NtfyFetchResponse>

export { isPublicNtfyAddress } from './ntfy-network'

export async function resolvePublicNtfyAddress(hostname: string, resolver: NtfyResolver = (name) => lookupDns(name, { all: true, order: 'verbatim' })) {
  const addresses = await resolver(hostname)
  if (!addresses.length || addresses.some(({ address, family }) => !isPublicNtfyAddress(address, family))) {
    throw new Error('ntfy endpoint did not resolve exclusively to public addresses')
  }
  return addresses[0]!
}

function requestPinnedNtfy(options: RequestOptions, body: string): Promise<NtfyFetchResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(options, (response) => {
      response.resume()
      const status = response.statusCode ?? 0
      resolve({ ok: status >= 200 && status < 300, status, text: async () => '' })
    })
    request.once('error', reject)
    request.end(body)
  })
}

/**
 * Uses Node's HTTPS client rather than fetch: it follows no redirects and its
 * custom lookup pins the TLS connection to the address checked immediately
 * before the request, preventing DNS rebinding between validation and connect.
 */
export async function secureNtfyFetch(input: string, init: RequestInit, dependencies: { resolver?: NtfyResolver; request?: NtfyRequest } = {}): Promise<NtfyFetchResponse> {
  const url = new URL(input)
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw new Error('ntfy delivery URL must use HTTPS on port 443')
  const body = typeof init.body === 'string' ? init.body : ''
  if (init.body !== undefined && typeof init.body !== 'string') throw new Error('ntfy delivery body must be text')
  const pinned = await resolvePublicNtfyAddress(url.hostname, dependencies.resolver)
  const headers = Object.fromEntries(new Headers(init.headers).entries())
  return (dependencies.request ?? requestPinnedNtfy)({
    protocol: 'https:', hostname: url.hostname, servername: url.hostname, port: 443,
    path: `${url.pathname}${url.search}`, method: init.method ?? 'POST', headers, lookup: createPinnedLookup(pinned), signal: init.signal ?? undefined,
  }, body)
}
