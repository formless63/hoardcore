export { isPublicNetworkAddress as isPublicShopifyAddress } from '~/lib/public-network-address'

export function isIpLiteral(hostname: string) {
  const host = hostname.replace(/^\[|\]$/gu, '')
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host) || host.includes(':')
}
