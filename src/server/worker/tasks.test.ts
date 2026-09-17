import { describe, expect, it, vi } from 'vitest'
import { createRobotsAccessPolicy, fixtureEchoTask, taskRegistry } from './tasks'
import { createShopifyCollectionRun } from '../../modules/shopify/transport'

describe('embedded worker task registry', () => {
  it('exposes the provider-neutral fixture task by its durable identifier', () => {
    expect(taskRegistry['fixture.echo']).toBe(fixtureEchoTask)
  })

  it('executes a fixture task without network or database access', async () => {
    const info = vi.fn()
    await fixtureEchoTask(
      { value: 'retained payload' },
      { logger: { info } } as never,
    )

    expect(info).toHaveBeenCalledWith('fixture.echo: retained payload')
  })

  it('fails closed for unavailable robots and caches an allowed policy per origin', async () => {
    const run = createShopifyCollectionRun(3)
    const http = vi.fn().mockResolvedValue(new Response('User-agent: *\nDisallow:\n'))
    const policy = createRobotsAccessPolicy(run, http)
    await expect(policy('https://synthetic.invalid/products.json')).resolves.toBe(true)
    await expect(policy('https://synthetic.invalid/collections/a/products.json')).resolves.toBe(true)
    expect(http).toHaveBeenCalledTimes(1)

    const denied = createRobotsAccessPolicy(createShopifyCollectionRun(), vi.fn().mockResolvedValue(new Response('User-agent: *\nDisallow: /\n')))
    await expect(denied('https://blocked.invalid/products.json')).resolves.toBe(false)
    const diagnostics = vi.fn()
    const unavailable = createRobotsAccessPolicy(createShopifyCollectionRun(), vi.fn().mockRejectedValue(Object.assign(new Error('offline'), { code: 'ECONNRESET' })), undefined, diagnostics)
    await expect(unavailable('https://unknown.invalid/products.json')).rejects.toThrow('offline')
    expect(diagnostics).toHaveBeenLastCalledWith(1, undefined, 'ECONNRESET')
  })

  it('rejects robots redirects without following them', async () => {
    const http = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://internal.invalid/' } }))
    const policy = createRobotsAccessPolicy(createShopifyCollectionRun(2), http)
    await expect(policy('https://synthetic.invalid/products.json')).rejects.toThrow('robots.txt returned HTTP 302')
    expect(http).toHaveBeenCalledWith('https://synthetic.invalid/robots.txt', expect.objectContaining({ redirect: 'error' }))
  })

  it('evaluates exact robots paths, wildcards, end anchors, and user-agent groups', async () => {
    const body = [
      'User-agent: *',
      'Disallow: /collections/*/products.json$',
      'Allow: /collections/public/products.json$',
      '',
      'User-agent: Hoardcore',
      'Disallow: /private/',
    ].join('\n')
    const http = vi.fn().mockResolvedValue(new Response(body))
    const policy = createRobotsAccessPolicy(
      createShopifyCollectionRun(4),
      http,
      'Hoardcore/0.1 (conservative catalog collector)',
    )

    await expect(policy('https://synthetic.invalid/private/products.json')).resolves.toBe(false)
    await expect(policy('https://synthetic.invalid/products.json')).resolves.toBe(true)
    expect(http).toHaveBeenCalledTimes(1)
  })
})
