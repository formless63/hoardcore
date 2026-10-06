import { chromium, type Browser, type CDPSession } from 'playwright-core'
import { createBrowserSourceRelay } from './browser-source-relay.server'
import { resolvePublicSourceAddress, type SourceResolver } from './source-http.server'
import type { SourceProxy } from '~/features/sources/source-routing.schemas'

const maxResponseBytes = 10 * 1024 * 1024

export function validateBrowserSourceUrl(input: string) {
  const url = new URL(input)
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443')
    throw new Error('Browser source request must use credential-free HTTPS on port 443')
  return url
}

export async function readBrowserResponseStream(session: Pick<CDPSession, 'send'>, handle: string, limit = maxResponseBytes) {
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const value = await session.send('IO.read', { handle, size: 65536 })
      const chunk = Buffer.from(value.data, value.base64Encoded ? 'base64' : 'utf8')
      total += chunk.length
      if (total > limit) throw new Error('Browser source response exceeds the 10 MiB limit')
      chunks.push(chunk)
      if (value.eof) return Buffer.concat(chunks)
    }
  } finally { await session.send('IO.close', { handle }).catch(() => undefined) }
}

/** One fresh browser document per acquisition; no hidden resource/redirect requests. */
export function createBrowserSourceHttpClient(proxy?: SourceProxy, resolver?: SourceResolver) {
  return async (input: string, init: RequestInit): Promise<Response> => {
    const url = validateBrowserSourceUrl(input)
    await resolvePublicSourceAddress(url.hostname, resolver)
    init.signal?.throwIfAborted()
    const relay = await createBrowserSourceRelay(url.hostname, proxy, resolver)
    let browser: Browser | undefined
    try {
      browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true,
        proxy: { server: relay.url }, timeout: 15000,
        args: ['--disable-quic', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability'],
      })
      const configuredAgent = new Headers(init.headers).get('user-agent')
      const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, javaScriptEnabled: false,
        ...(configuredAgent ? { userAgent: configuredAgent } : {}),
      })
      const page = await context.newPage()
      let requested = false
      await context.route('**/*', async route => {
        const request = route.request()
        if (requested || !request.isNavigationRequest() || request.method() !== 'GET' || request.url() !== url.href) { await route.abort(); return }
        requested = true
        // Let Chromium supply its native navigation headers. Conditional cache
        // validators are the only extra origin headers used by collection.
        const original = await request.allHeaders()
        const validators = Object.fromEntries([...new Headers(init.headers)].filter(([name]) => ['if-none-match', 'if-modified-since'].includes(name)))
        await route.continue({ headers: { ...original, ...validators } })
      })
      const session = await context.newCDPSession(page)
      const result = new Promise<Response>((resolve, reject) => {
        session.on('Fetch.requestPaused', async event => {
          try {
            if (!event.responseStatusCode) throw new Error('Browser source response was unavailable')
            const headers = new Headers(event.responseHeaders?.map(header => [header.name, header.value]))
            const status = event.responseStatusCode
            if (status < 200 || status >= 300 || status === 204) {
              resolve(new Response(null, { status, headers }))
            } else {
              const length = Number(headers.get('content-length'))
              if (length > maxResponseBytes) throw new Error('Browser source response exceeds the 10 MiB limit')
              const { stream } = await session.send('Fetch.takeResponseBodyAsStream', { requestId: event.requestId })
              const body = await readBrowserResponseStream(session, stream)
              resolve(new Response(new Uint8Array(body), { status, headers }))
            }
          } catch (error) { reject(error) }
          finally { await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' }).catch(() => undefined) }
        })
      })
      await session.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Response' }] })
      const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
      let onAbort: (() => void) | undefined
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason)
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) onAbort()
      })
      try {
        const navigationFailed = page.goto(url.href, { waitUntil: 'commit', timeout: 30000 }).then(() => new Promise<never>(() => {}))
        return await Promise.race([result, aborted, navigationFailed])
      } finally { if (onAbort) signal.removeEventListener('abort', onAbort) }
    } catch (error) {
      const sanitized = new Error('Browser source request failed; no alternate-route fallback')
      sanitized.name = error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name) ? error.name : 'Error'
      throw sanitized
    } finally { await browser?.close().catch(() => undefined); await relay.close() }
  }
}
