import type { z } from 'zod'

export type ModuleStatus = 'planned' | 'experimental' | 'stable'

export type SourceConfig = Record<string, unknown>

export interface HoardcoreModuleManifest {
  id: string
  name: string
  description: string
  status: ModuleStatus
}

export interface NormalizedSourceConfig {
  config: SourceConfig
  sourceKey: string
  summary: string
}

export interface SourceRegistrationCapability<TInputSchema extends z.ZodType = z.ZodType> {
  inputSchema: TInputSchema
  normalize: (input: unknown) => NormalizedSourceConfig
  read: (config: unknown) => NormalizedSourceConfig
}

export interface HoardcoreSourceModule<TInputSchema extends z.ZodType = z.ZodType> {
  manifest: HoardcoreModuleManifest
  sourceRegistration: SourceRegistrationCapability<TInputSchema>
}
