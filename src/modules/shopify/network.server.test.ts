import { describe, expect, it } from 'vitest'
import { createSecureShopifyHttpClient, resolvePublicShopifyAddress } from './network.server'

describe('secure Shopify transport', () => {
  it('rejects private and mixed DNS results before opening a connection', async () => {
    for (const answer of [
      { address: '127.0.0.1', family: 4 }, { address: '192.0.2.1', family: 4 }, { address: '198.51.100.1', family: 4 },
      { address: '203.0.113.1', family: 4 }, { address: '::ffff:127.0.0.1', family: 6 }, { address: '::c000:201', family: 6 }, { address: '64:ff9b::c000:201', family: 6 },
      { address: '2001:db8::1', family: 6 }, { address: '2002:7f00:1::1', family: 6 },
    ]) {
      await expect(resolvePublicShopifyAddress('shop.example.test', async () => [answer])).rejects.toThrow('exclusively to public')
    }
    await expect(resolvePublicShopifyAddress('shop.example.test', async () => [
      { address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 },
    ])).rejects.toThrow('exclusively to public')
  })

  it('pins the checked public address for the actual HTTPS request', async () => {
    let connectedAddress = ''
    const http = createSecureShopifyHttpClient({
      resolver: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async (options) => {
        options.lookup!('shop.example.test', {}, (_error, address) => { connectedAddress = String(address) })
        expect(options).toMatchObject({ hostname: 'shop.example.test', servername: 'shop.example.test', port: 443, path: '/products.json?limit=250' })
        return new Response('{"products":[]}')
      },
    })
    const response = await http('https://shop.example.test/products.json?limit=250', { headers: { accept: 'application/json' }, redirect: 'error' })
    expect(connectedAddress).toBe('93.184.216.34')
    await expect(response.json()).resolves.toEqual({ products: [] })
  })
})
