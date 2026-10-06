import { describe, expect, it, vi } from 'vitest'
import { chromium } from 'playwright-core'
import { createBrowserSourceHttpClient, readBrowserResponseStream, validateBrowserSourceUrl } from './browser-source-http.server'
import { createBrowserSourceRelay } from './browser-source-relay.server'

vi.mock('playwright-core', () => ({ chromium: { launch: vi.fn() } }))
vi.mock('./browser-source-relay.server', () => ({ createBrowserSourceRelay: vi.fn() }))

function fixture(status: number) {
  const close = vi.fn(async () => {})
  const send = vi.fn(async (method: string) => {
    if (method === 'Fetch.takeResponseBodyAsStream') return { stream: 'fixture' }
    if (method === 'IO.read') return { data: '{"products":[]}', eof: true }
    return {}
  })
  let handler: (event: unknown) => Promise<void>
  const context = { route: vi.fn(), newCDPSession: async () => ({ on: (_event: string, fn: typeof handler) => { handler = fn }, send }),
    newPage: async () => ({ goto: async () => {
      await handler({ responseStatusCode: status, responseHeaders: [{ name: 'retry-after', value: '60' }], requestId: 'fixture' })
      return new Promise<never>(() => {})
    } }),
  }
  const newContext = vi.fn(async () => context)
  vi.mocked(chromium.launch).mockResolvedValue({ newContext, close } as never)
  vi.mocked(createBrowserSourceRelay).mockResolvedValue({ url: 'http://127.0.0.1:32123', close })
  return { send, close, context, newContext }
}

describe('browser source transport', () => {
  it('accepts only credential-free HTTPS on the standard port', () => {
    expect(validateBrowserSourceUrl('https://catalog.example.test/products.json').hostname).toBe('catalog.example.test')
    for (const url of ['http://example.test/', 'https://user:secret@example.test/', 'https://example.test:8443/'])
      expect(() => validateBrowserSourceUrl(url)).toThrow('credential-free HTTPS')
  })
  it('rejects private and mixed DNS before launching a browser', async () => {
    const http = createBrowserSourceHttpClient(undefined, async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }])
    await expect(http('https://catalog.example.test/', {})).rejects.toThrow('exclusively to public')
  })
  it('reads streamed UTF-8 and binary payloads and closes the stream', async () => {
    const calls: string[] = []
    const chunks = [{ data: '{"products":', eof: false }, { data: Buffer.from('[]}').toString('base64'), base64Encoded: true, eof: true }]
    const session = { send: async (method: string) => { calls.push(method); return method === 'IO.read' ? chunks.shift()! : {} } }
    expect((await readBrowserResponseStream(session as never, 'fixture')).toString()).toBe('{"products":[]}')
    expect(calls).toEqual(['IO.read', 'IO.read', 'IO.close'])
  })
  it('bounds response memory and closes failed streams', async () => {
    const calls: string[] = []
    const session = { send: async (method: string) => { calls.push(method); return { data: 'too large', eof: true } } }
    await expect(readBrowserResponseStream(session as never, 'fixture', 2)).rejects.toThrow('limit')
    expect(calls).toEqual(['IO.read', 'IO.close'])
  })
  it('returns a 429 without reading its body or retrying and closes both resources', async () => {
    const mock = fixture(429)
    const http = createBrowserSourceHttpClient(undefined, async () => [{ address: '93.184.216.34', family: 4 }])
    const response = await http('https://catalog.example.test/', { headers: { 'user-agent': 'fixture-agent' } })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(mock.send.mock.calls.some(([name]) => name === 'Fetch.takeResponseBodyAsStream')).toBe(false)
    expect(mock.close).toHaveBeenCalledTimes(2)
    expect(mock.newContext).toHaveBeenCalledWith(expect.objectContaining({ javaScriptEnabled: false, serviceWorkers: 'block', userAgent: 'fixture-agent' }))
  })
  it('returns full JSON and blocks background requests and redirects', async () => {
    const mock = fixture(200)
    const http = createBrowserSourceHttpClient(undefined, async () => [{ address: '93.184.216.34', family: 4 }])
    expect(await (await http('https://catalog.example.test/', {})).json()).toEqual({ products: [] })
    const route = mock.context.route.mock.calls[0]![1]
    const abort = vi.fn()
    const continuation = vi.fn()
    const request = (url: string, navigation: boolean) => ({ url: () => url, isNavigationRequest: () => navigation, method: () => 'GET', allHeaders: async () => ({ accept: 'browser-native' }) })
    await route({ request: () => request('https://catalog.example.test/image.png', false), abort })
    await route({ request: () => request('https://catalog.example.test/', true), continue: continuation })
    await route({ request: () => request('https://catalog.example.test/redirect', true), abort })
    expect(abort).toHaveBeenCalledTimes(2)
    expect(continuation).toHaveBeenCalledWith({ headers: { accept: 'browser-native' } })
  })
})
