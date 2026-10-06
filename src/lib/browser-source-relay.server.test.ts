import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createBrowserSourceRelay } from './browser-source-relay.server'

function tunnel(endpoint: string, authority: string) {
  return new Promise<number>((resolve, reject) => {
    const url = new URL(endpoint)
    const req = request({ hostname: url.hostname, port: url.port, method: 'CONNECT', path: authority })
    req.once('connect', (response, socket) => { socket.destroy(); resolve(response.statusCode!) })
    req.once('error', reject)
    req.end()
  })
}
describe('browser source tunnel', () => {
  it('pins public destinations, authenticates only to the proxy, and never falls back', async () => {
    const proxy = createServer()
    const requests: string[] = []
    proxy.on('connect', (req, socket) => {
      requests.push(req.url!)
      expect(req.headers['proxy-authorization']).toBe(`Basic ${Buffer.from('test:secret').toString('base64')}`)
      socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n')
    })
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
    const relay = await createBrowserSourceRelay('catalog.example.test', { endpoint: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, username: 'test', password: 'secret' }, async () => [{ address: '93.184.216.34', family: 4 }])
    try {
      expect(await tunnel(relay.url, 'other.example.test:443')).toBe(502)
      expect(await tunnel(relay.url, 'catalog.example.test:443')).toBe(502)
      expect(await tunnel(relay.url, 'catalog.example.test:443')).toBe(502)
      expect(requests).toEqual(['93.184.216.34:443'])
    } finally { await relay.close(); await new Promise<void>(resolve => proxy.close(() => resolve())) }
  })
  it('rejects private DNS before contacting the proxy', async () => {
    const relay = await createBrowserSourceRelay('catalog.example.test', { endpoint: 'http://127.0.0.1:1', username: '', password: '' }, async () => [{ address: '127.0.0.1', family: 4 }])
    try { expect(await tunnel(relay.url, 'catalog.example.test:443')).toBe(502) }
    finally { await relay.close() }
  })
})
