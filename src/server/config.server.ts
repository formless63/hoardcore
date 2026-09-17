import { z } from 'zod'

const postgresUrlSchema = z
  .string({ error: 'is required' })
  .pipe(z.url('must be a valid URL'))
  .pipe(
    z.string().regex(
      /^postgres(?:ql)?:\/\//u,
      'must use the postgres:// or postgresql:// protocol',
    ),
  )

const optionalEnvironmentValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => value === '' ? undefined : value, schema.optional())

const serverConfigSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
  BETTER_AUTH_URL: z.url().optional(),
  OIDC_ISSUER: optionalEnvironmentValue(z.url()),
  OIDC_CLIENT_ID: optionalEnvironmentValue(z.string().min(1)),
  OIDC_CLIENT_SECRET: optionalEnvironmentValue(z.string().min(1)),
  OIDC_PROVIDER_NAME: optionalEnvironmentValue(z.string().min(1).max(80)),
  OIDC_PROVIDER_ICON_URL: optionalEnvironmentValue(z.string().regex(/^\/(?!\/)[A-Za-z0-9/_\-.]+$/u, 'must be a same-origin absolute path')),
  SMTP_HOST: optionalEnvironmentValue(z.string().min(1)),
  SMTP_PORT: optionalEnvironmentValue(z.coerce.number().int().min(1).max(65535)),
  SMTP_USER: optionalEnvironmentValue(z.string().min(1)),
  SMTP_PASSWORD: optionalEnvironmentValue(z.string().min(1)),
  SMTP_FROM: optionalEnvironmentValue(z.email()),
  SMTP_SECURE: optionalEnvironmentValue(z.enum(['true', 'false'])),
  // Disable collection entirely on hosts that must never contact source sites.
  CATALOG_COLLECTION_ENABLED: z.enum(['true', 'false']).default('true'),
  // Media acquisition is disabled unless this deployment explicitly opts in.
  // Development hosts should leave this unset to avoid source-CDN requests.
  MEDIA_CAPTURE_ENABLED: z.enum(['true', 'false']).default('false'),
  MEDIA_CAPTURE_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(3),
  MEDIA_CAPTURE_MINIMUM_DELAY_MS: z.coerce.number().int().min(1_000).max(15 * 60_000).default(1_500),
  MEDIA_CAPTURE_AUTO_REQUEST_LIMIT: z.coerce.number().int().min(2).max(100).default(20),
}).superRefine((config, context) => {
  const oidc = [config.OIDC_ISSUER, config.OIDC_CLIENT_ID, config.OIDC_CLIENT_SECRET]
  if (oidc.some(Boolean) && !oidc.every(Boolean)) {
    context.addIssue({ code: 'custom', path: ['OIDC_ISSUER'], message: 'OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET must be configured together' })
  }
  const smtp = [config.SMTP_HOST, config.SMTP_PORT, config.SMTP_USER, config.SMTP_PASSWORD, config.SMTP_FROM]
  if (smtp.some(Boolean) && !smtp.every(Boolean)) {
    context.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM must be configured together' })
  }
  if (smtp.every(Boolean) && !oidc.every(Boolean)) {
    context.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'Magic-link SMTP requires OIDC to be configured for initial account creation' })
  }
})

export type ServerConfig = Readonly<z.infer<typeof serverConfigSchema>>

let cachedConfig: ServerConfig | undefined

export function parseServerConfig(
  environment: Record<string, string | undefined>,
): ServerConfig {
  const result = serverConfigSchema.safeParse(environment)

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const setting = issue.path.join('.') || 'environment'
      return `- ${setting}: ${issue.message}`
    })

    throw new Error(`Invalid server configuration:\n${problems.join('\n')}`)
  }

  return Object.freeze(result.data)
}

export function getServerConfig(): ServerConfig {
  cachedConfig ??= parseServerConfig(process.env)
  return cachedConfig
}

export function normalizeOidcDiscoveryUrl(issuer: string): string {
  return `${issuer.replace(/\/$/u, '')}/.well-known/openid-configuration`
}
