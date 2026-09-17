import { describe, expect, it } from 'vitest'
import { isPublicNtfyAddress, resolvePublicNtfyAddress, secureNtfyFetch } from './ntfy-transport.server'

describe('secure ntfy transport', () => {
  it('rejects private, loopback, link-local, and multicast DNS answers before connecting', async () => {
    for (const answer of [{ address: '127.0.0.1', family: 4 }, { address: '10.0.0.1', family: 4 }, { address: '169.254.1.1', family: 4 }, { address: '::1', family: 6 }, { address: 'fe80::1', family: 6 }, { address: 'ff02::1', family: 6 }]) {
      expect(isPublicNtfyAddress(answer.address, answer.family)).toBe(false)
      await expect(resolvePublicNtfyAddress('ntfy.example.test', async () => [answer])).rejects.toThrow('public addresses')
    }
  })

  it('rejects a mixed DNS answer set so a hostname cannot alternate to a private address', async () => {
    await expect(resolvePublicNtfyAddress('ntfy.example.test', async () => [
      { address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 },
    ])).rejects.toThrow('public addresses')
  })

  it('rejects non-public transition and documentation addresses for alert delivery too', async () => {
    for (const answer of [
      { address: '192.0.2.1', family: 4 }, { address: '198.51.100.1', family: 4 },
      { address: '203.0.113.1', family: 4 }, { address: '64:ff9b::c000:201', family: 6 },
      { address: '2001:db8::1', family: 6 }, { address: '2002:7f00:1::1', family: 6 },
    ]) {
      expect(isPublicNtfyAddress(answer.address, answer.family)).toBe(false)
      await expect(resolvePublicNtfyAddress('ntfy.example.test', async () => [answer])).rejects.toThrow('public addresses')
    }
  })

  it('pins the actual HTTPS connection to the checked public DNS address and does not follow redirects', async () => {
    let connectedAddress = ''
    const response = await secureNtfyFetch('https://ntfy.example.test/topic', { method: 'POST', body: 'alert', headers: { title: 'Alert' } }, {
      resolver: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async (options) => {
        options.lookup!('ntfy.example.test', {}, (_error, address) => { connectedAddress = String(address) })
        expect(options).toMatchObject({ hostname: 'ntfy.example.test', servername: 'ntfy.example.test', port: 443, path: '/topic' })
        return { ok: false, status: 302, text: async () => '' }
      },
    })
    expect(connectedAddress).toBe('93.184.216.34')
    expect(response).toMatchObject({ ok: false, status: 302 })
  })

  it('rejects non-standard ports before DNS resolution', async () => {
    let resolved = false
    await expect(secureNtfyFetch('https://ntfy.example.test:8443/topic', { method: 'POST' }, { resolver: async () => { resolved = true; return [] } })).rejects.toThrow('port 443')
    expect(resolved).toBe(false)
  })
})
