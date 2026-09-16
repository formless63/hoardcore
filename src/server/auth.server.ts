import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { genericOAuth } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getServerConfig, normalizeOidcDiscoveryUrl } from './config.server'
import { getDatabase } from './db/index.server'
import { authSchema } from './db/schema/auth'
import { z } from 'zod'

const authRuntimeConfigSchema = z.object({
  secret: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
})

let instance: ReturnType<typeof betterAuth> | undefined

export function getAuth() {
  if (instance) return instance
  const config = getServerConfig()
  const runtime = authRuntimeConfigSchema.parse({ secret: config.BETTER_AUTH_SECRET })
  const options: BetterAuthOptions = {
    database: drizzleAdapter(getDatabase(), { provider: 'pg', schema: authSchema }),
    secret: runtime.secret,
    baseURL: config.BETTER_AUTH_URL,
    advanced: { useSecureCookies: config.BETTER_AUTH_URL?.startsWith('https://') ?? false },
    plugins: [
      ...(config.OIDC_ISSUER
        ? [genericOAuth({
            config: [{
              providerId: 'oidc',
              clientId: config.OIDC_CLIENT_ID!,
              clientSecret: config.OIDC_CLIENT_SECRET!,
              discoveryUrl: normalizeOidcDiscoveryUrl(config.OIDC_ISSUER),
              requireIdTokenVerification: true,
              scopes: ['openid', 'email', 'profile'],
            }],
          })]
        : []),
      tanstackStartCookies(),
    ],
  }
  instance = betterAuth(options)
  return instance
}

export async function getSession() {
  return getAuth().api.getSession({ headers: getRequestHeaders() })
}

export async function requireSession() {
  return requireSessionFrom(getSession)
}

export async function requireSessionFrom(
  sessionReader: () => Promise<Awaited<ReturnType<typeof getSession>>>,
) {
  const session = await sessionReader()
  if (!session) throw new Error('Unauthorized')
  return session
}

/**
 * Runs a privileged operation only after a server-side session has been
 * established. The injectable reader keeps the authorization boundary
 * testable without weakening production callers.
 */
export async function withRequiredSession<T>(
  operation: () => Promise<T>,
  sessionReader: () => Promise<Awaited<ReturnType<typeof getSession>>> = getSession,
): Promise<T> {
  await requireSessionFrom(sessionReader)
  return operation()
}
