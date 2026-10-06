import { describe, expect, it, vi } from 'vitest'
import { parseAdditionalRequestHeaders, sourceRequestHeadersSchema, withSourceRequestHeaders } from './request-headers'
import { cooldownReleaseInputSchema } from './cooldown-release.schemas'

describe('public source request headers', () => {
  it('normalizes names and validates header syntax and values', () => {
    expect(sourceRequestHeadersSchema.parse({ 'User-Agent': 'Browser fixture', 'Accept-Language': 'en-US' })).toEqual({ 'user-agent': 'Browser fixture', 'accept-language': 'en-US' })
    for (const input of [{ 'bad name': 'value' }, { accept: 'x\r\nHost: injected' }, { accept: '\0' }, { 'user-agent': '' }, { accept: '💥' }])
      expect(sourceRequestHeadersSchema.safeParse(input).success).toBe(false)
    expect(sourceRequestHeadersSchema.safeParse(Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`x-${index}`, 'value']))).success).toBe(false)
  })
  it('keeps proxy, framing, credentials, and conditional-cache headers out of the public editor', () => {
    for (const name of ['Host', 'Proxy-Authorization', 'Authorization', 'Cookie', 'Content-Length', 'Transfer-Encoding', 'Connection', 'If-None-Match', 'If-Modified-Since'])
      expect(sourceRequestHeadersSchema.safeParse({ [name]: 'fixture' }).success).toBe(false)
  })
  it('parses additional headers without silently dropping duplicate or malformed lines', () => {
    expect(parseAdditionalRequestHeaders('Cache-Control: no-cache\r\nX-Client: browser\n')).toEqual({ 'cache-control': 'no-cache', 'x-client': 'browser' })
    for (const text of ['invalid line', 'X-Client: one\nx-client: two', 'User-Agent: use-named-field', 'Cookie: private'])
      expect(() => parseAdditionalRequestHeaders(text)).toThrow()
  })
  it('applies explicit overrides while retaining collectors’ validators and the request deadline', async () => {
    const raw = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}'))
    const signal = AbortSignal.timeout(5000)
    await withSourceRequestHeaders(raw, { 'user-agent': 'operator-agent', accept: 'application/json', 'accept-language': 'en-US' })('https://example.test/', {
      headers: { 'user-agent': 'module-default', 'if-none-match': 'fixture-etag' }, signal,
    })
    const init = raw.mock.calls[0]![1]
    expect(Object.fromEntries(new Headers(init.headers))).toEqual({ 'user-agent': 'operator-agent', accept: 'application/json', 'accept-language': 'en-US', 'if-none-match': 'fixture-etag' })
    expect(init.signal).toBe(signal)
  })
})
describe('manual cooldown-release contract', () => {
  it('requires explicit confirmation, a reason, and the reviewed state', () => {
    const input = { sourceId: crypto.randomUUID(), confirmed: true, reason: 'Reviewed network behavior', expectedBlockedUntil: new Date().toISOString(), expectedPaused: true }
    expect(cooldownReleaseInputSchema.parse(input).resume).toBe(false)
    for (const patch of [{ confirmed: false }, { reason: ' ' }, { expectedBlockedUntil: undefined }, { expectedPaused: undefined }])
      expect(cooldownReleaseInputSchema.safeParse({ ...input, ...patch }).success).toBe(false)
  })
})
