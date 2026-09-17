import { z } from 'zod'

export const catalogSourceStatusSchema = z.enum([
  'not_collected',
  'active',
  'paused',
  'error',
])

export const createCatalogSourceInputSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(120, 'Name must be 120 characters or fewer'),
  moduleId: z.string().trim().min(1, 'Source type is required'),
  config: z.record(z.string(), z.unknown()),
})

export const manualCollectionRequestLimitSchema = z.number().int().min(2).max(20)

export const catalogSourceSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  moduleId: z.string(),
  moduleName: z.string(),
  status: catalogSourceStatusSchema,
  collectionEnabled: z.boolean(),
  scheduleHours: z.union([z.literal(24), z.literal(72), z.literal(168)]).nullable(),
  scheduleRequestLimit: manualCollectionRequestLimitSchema,
  nextRunAt: z.string().nullable(),
  summary: z.string(),
  createdAt: z.string(),
})

export type CatalogSourceStatus = z.infer<typeof catalogSourceStatusSchema>
export type CreateCatalogSourceInput = z.infer<typeof createCatalogSourceInputSchema>
export type CatalogSourceSummary = z.infer<typeof catalogSourceSummarySchema>

export const updateSourceScheduleSchema = z.object({
  sourceId: z.uuid(),
  collectionEnabled: z.boolean(),
  scheduleHours: z.union([z.literal(24), z.literal(72), z.literal(168)]).nullable(),
  scheduleRequestLimit: manualCollectionRequestLimitSchema,
})
export type UpdateSourceScheduleInput = z.infer<typeof updateSourceScheduleSchema>
