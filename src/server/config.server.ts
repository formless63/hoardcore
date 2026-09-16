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
}).superRefine((config, context) => {
  const oidc = [config.OIDC_ISSUER, config.OIDC_CLIENT_ID, config.OIDC_CLIENT_SECRET]
  if (oidc.some(Boolean) && !oidc.every(Boolean)) {
    context.addIssue({ code: 'custom', path: ['OIDC_ISSUER'], message: 'OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET must be configured together' })
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
