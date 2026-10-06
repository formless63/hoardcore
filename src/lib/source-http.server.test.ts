import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { createSourceHttpClient, resolvePublicSourceAddress, sourceRequestOptions } from './source-http.server'

const pinned = { address: '93.184.216.34', family: 4 }
const url = new URL('https://catalog.example.test/products.json?limit=250')

describe('source HTTP proxy transport', () => {
  it('pins CONNECT to the checked address while preserving origin TLS and Host', () => {
    const options = sourceRequestOptions(url, pinned, { headers: { accept: 'application/json', 'proxy-authorization': 'must-not-reach-origin' } },
      { endpoint: 'http://proxy:8888', username: 'operator', password: 'secret' })
    expect(options).toMatchObject({ hostname: pinned.address, servername: url.hostname, port: 443, path: '/products.json?limit=250', method: 'GET' })
    expect(options.headers).toEqual({ accept: 'application/json', host: url.host })
    expect(options.rejectUnauthorized).not.toBe(false)
    const agent = options.agent as HttpsProxyAgent<string>
    expect(agent.proxy.href).toBe('http://proxy:8888/')
    expect(agent.proxy.password).toBe('')
    expect(agent.proxyHeaders).toEqual({ 'Proxy-Authorization': `Basic ${Buffer.from('operator:secret').toString('base64')}` })
    expect(sourceRequestOptions(url, pinned, {}).hostname).toBe(url.hostname)
  })

  it('rejects private/mixed addresses before touching the configured proxy', async () => {
    await expect(resolvePublicSourceAddress(url.hostname, async () => [pinned, { address: '10.0.0.1', family: 4 }])).rejects.toThrow('exclusively to public')
    const http = createSourceHttpClient({ endpoint: 'http://127.0.0.1:1', username: '', password: '' }, async () => [{ address: '127.0.0.1', family: 4 }])
    await expect(http(url.href, {})).rejects.toThrow('exclusively to public')
    await expect(http('http://catalog.example.test/', {})).rejects.toThrow('credential-free HTTPS')
    await expect(http('https://catalog.example.test:8443/', {})).rejects.toThrow('port 443')
  })

  it('does not treat a rejected CONNECT as an origin response or leak proxy credentials', async () => {
    const proxy = createServer()
    let attempts = 0
    proxy.on('connect', (request, socket) => {
      attempts++
      expect(request.url).toBe(`${pinned.address}:443`)
      expect(request.headers['proxy-authorization']).toBe(`Basic ${Buffer.from('test:private-password').toString('base64')}`)
      socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n')
    })
    await new Promise<void>((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve) })
    try {
      const http = createSourceHttpClient({ endpoint: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, username: 'test', password: 'private-password' }, async () => [pinned])
      await expect(http(url.href, { signal: AbortSignal.timeout(2000) })).rejects.toThrow('Configured source proxy connection failed; no direct fallback')
      expect(attempts).toBe(1)
    } finally { await new Promise<void>(resolve => proxy.close(() => resolve())) }
  })
})
