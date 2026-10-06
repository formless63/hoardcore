import { z } from 'zod'

// These settings are public origin headers, not a credential store. Routing,
// framing, and cache validators remain owned by the transport/collector.
const managedNames = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'keep-alive',
  'proxy-authorization', 'proxy-authenticate', 'proxy-connection', 'authorization', 'cookie', 'set-cookie', 'if-none-match', 'if-modified-since'])
export const requestHeaderNameSchema = z.string().trim().min(1).max(128)
  .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u, 'Enter a valid HTTP header name')
  .transform(value => value.toLowerCase())
  .refine(value => !managedNames.has(value), 'This header is managed by the transport or requires credential storage')
export const requestHeaderValueSchema = z.string().max(2048)
  .refine(value => !/[\x00-\x1f\x7f]/u.test(value), 'Header values cannot contain control characters or line breaks')
  .refine(value => [...value].every(char => char.charCodeAt(0) <= 255), 'Header values must use HTTP-compatible characters')
export const sourceRequestHeadersSchema = z.record(requestHeaderNameSchema, requestHeaderValueSchema).superRefine((value, context) => {
  if (Object.keys(value).length > 32) context.addIssue({ code: 'custom', message: 'Use at most 32 request headers' })
  if ('user-agent' in value && !value['user-agent']?.trim()) context.addIssue({ code: 'custom', path: ['user-agent'], message: 'User-Agent must not be empty; remove the override to use the default' })
})
export type SourceRequestHeaders = z.infer<typeof sourceRequestHeadersSchema>

export function parseAdditionalRequestHeaders(text: string): SourceRequestHeaders {
  const headers: Record<string, string> = {}
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue
    const separator = line.indexOf(':')
    if (separator < 1) throw new Error('Enter additional headers as Name: value, one per line')
    const name = requestHeaderNameSchema.parse(line.slice(0, separator))
    if (['user-agent', 'accept', 'accept-language'].includes(name)) throw new Error('Use the named field for User-Agent, Accept, or Accept-Language')
    if (name in headers) throw new Error(`Duplicate header: ${name}`)
    headers[name] = line.slice(separator + 1).trim()
  }
  return sourceRequestHeadersSchema.parse(headers)
}

export function withSourceRequestHeaders<I extends { headers?: HeadersInit }, T>(http: (url: string, init: I) => Promise<T>, input: SourceRequestHeaders) {
  const overrides = sourceRequestHeadersSchema.parse(input)
  return (url: string, init: I): Promise<T> => {
    const headers = new Headers(init.headers)
    for (const [name, value] of Object.entries(overrides)) headers.set(name, value)
    return http(url, { ...init, headers: Object.fromEntries(headers) })
  }
}
