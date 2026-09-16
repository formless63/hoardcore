import { createServerFn } from '@tanstack/react-start'

export const getPublicLoginConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const { getServerConfig } = await import('./config.server')
  const { isSmtpConfigured } = await import('./mail.server')
  const config = getServerConfig()
  return {
    oidcAvailable: Boolean(config.OIDC_ISSUER),
    magicLinkAvailable: isSmtpConfigured(config),
    providerName: config.OIDC_PROVIDER_NAME || 'Identity provider',
    providerIconUrl: config.OIDC_PROVIDER_ICON_URL || null,
  }
})
