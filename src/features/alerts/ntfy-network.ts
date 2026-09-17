function isPublicIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [first, second] = parts
  return first >= 1 && first <= 223
    && first !== 10 && first !== 127
    && !(first === 100 && second >= 64 && second <= 127)
    && !(first === 169 && second === 254)
    && !(first === 172 && second >= 16 && second <= 31)
    && !(first ===192 && (second === 0 || second === 168))
    && !(first === 198 && (second === 18 || second === 19))
}

/** Reject loopback, private, link-local, multicast, unspecified, and malformed addresses. */
export function isPublicNtfyAddress(address: string, family: number) {
  if (family === 4) return isPublicIpv4(address)
  if (family !== 6) return false
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) return isPublicIpv4(normalized.slice(7))
  return normalized !== '::' && normalized !== '::1'
    && !normalized.startsWith('fc') && !normalized.startsWith('fd')
    && !/^fe[89ab]/u.test(normalized) && !normalized.startsWith('ff')
}
