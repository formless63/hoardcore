import { z } from 'zod'

export const mediaVariantSchema = z.enum(['thumbnail', 'preview'])
export type MediaVariant = z.infer<typeof mediaVariantSchema>

export const mediaCapturePolicySchema = z.object({
  enabled: z.boolean().default(false),
  requestLimit: z.number().int().min(1).max(100).default(20),
  concurrency: z.number().int().min(1).max(4).default(3),
  minimumDelayMs: z.number().int().min(1_000).max(15 * 60_000).default(1_500),
  maxRetries: z.number().int().min(0).max(2).default(1),
  userAgent: z.string().trim().min(1).max(200).default('Hoardcore/0.1 (operator-approved media capture)'),
})

export type MediaCapturePolicy = z.output<typeof mediaCapturePolicySchema>

export const createMediaCaptureRunSchema = z.object({
  sourceId: z.uuid(),
  requestLimit: z.number().int().min(2).max(100).default(20),
})
