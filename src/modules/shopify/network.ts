function isPublicIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [first, second, third] = parts
  return first >= 1 && first <= 223
    && first !== 10 && first !== 127
    && !(first === 100 && second >= 64 && second <= 127)
    && !(first === 169 && second === 254)
    && !(first === 172 && second >= 16 && second <= 31)
    && !(first === 192 && (second === 0 || second === 88 || second === 168))
    && !(first === 198 && (second === 18 || second === 19 || second === 51))
    && !(first === 192 && second === 0 && third === 2)
    && !(first === 203 && second === 0 && third === 113)
}

function ipv6Hextets(address: string): number[] | undefined {
  const parts = address.split('::')
  if (parts.length > 2) return undefined
  const left = parts[0] ? parts[0].split(':') : []
  const right = parts[1] ? parts[1].split(':') : []
  const segments = [...left, ...right]
  if (segments.some((segment) => !/^[0-9a-f]{1,4}$/iu.test(segment))) return undefined
  const missing = 8 - segments.length
  if (missing < 0 || parts.length === 1 && missing !== 0) return undefined
  return [...left, ...Array(missing).fill('0'), ...right].map((segment) => Number.parseInt(segment, 16))
}

/** Reject non-routable IPv4/IPv6 addresses before a source can reach them. */
export function isPublicShopifyAddress(address: string, family: number) {
  if (family === 4) return isPublicIpv4(address)
  if (family !== 6) return false
  const normalized = address.toLowerCase()
  const words = ipv6Hextets(normalized)
  if (!words) return false
  const mappedIpv4 = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff
  const ipv4Compatible = words.slice(0, 6).every((word) => word === 0)
  if (mappedIpv4 || ipv4Compatible) return false
  return !(words.every((word) => word === 0) || words.slice(0, 7).every((word) => word === 0) && words[7] === 1)
    && (words[0]! & 0xfe00) !== 0xfc00 // unique-local fc00::/7
    && (words[0]! & 0xffc0) !== 0xfe80 // link-local fe80::/10
    && (words[0]! & 0xff00) !== 0xff00 // multicast ff00::/8
    && words[0] !== 0x0100 // discard-only 100::/64
    && !(words[0] === 0x0064 && words[1] === 0xff9b) // NAT64 64:ff9b::/96 and local-use extension
    && words[0] !== 0x2002 // 6to4 transition range
    && !(words[0] === 0x2001 && (words[1] === 0 || words[1] === 2 || words[1]! >= 0x10 && words[1]! <= 0x1f || words[1] === 0xdb8))
    && (words[0]! & 0xfff0) !== 0x3ff0 // documentation range 3fff::/20
}

export function isIpLiteral(hostname: string) {
  const host = hostname.replace(/^\[|\]$/gu, '')
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host) || host.includes(':')
}
