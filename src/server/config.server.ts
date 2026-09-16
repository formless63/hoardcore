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

const serverConfigSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
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
