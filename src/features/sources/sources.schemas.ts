import { z } from 'zod'
import { DEFAULT_SCHEDULE_TIME_ZONE, validateCollectionCron } from './source-schedule'

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
export const interPageWaitMsSchema = z.number().int().refine((value) => value === 0 || (value >= 60_000 && value <= 300_000),
  'Inter-page wait must be off or between one and five minutes')

export const catalogSourceSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  moduleId: z.string(),
  moduleName: z.string(),
  status: catalogSourceStatusSchema,
  collectionEnabled: z.boolean(),
  scheduleCron: z.string().nullable(),
  scheduleTimezone: z.string(),
  legacyScheduleHours: z.number().int().positive().nullable(),
  scheduleRequestLimit: manualCollectionRequestLimitSchema,
  nextRunAt: z.string().nullable(),
  summary: z.string(),
  currency: z.string().nullable(),
  stockCardsEnabled: z.boolean(),
  robotsPolicy: z.enum(['respect', 'operator_approved']),
  createdAt: z.string(),
})

export type CatalogSourceStatus = z.infer<typeof catalogSourceStatusSchema>
export type CreateCatalogSourceInput = z.infer<typeof createCatalogSourceInputSchema>
export type CatalogSourceSummary = z.infer<typeof catalogSourceSummarySchema>

export const updateSourceScheduleSchema = z.object({
  sourceId: z.uuid(),
  collectionEnabled: z.boolean(),
  scheduleCron: z.string().trim().max(120).nullable(),
  scheduleTimezone: z.string().trim().min(1).max(100).default(DEFAULT_SCHEDULE_TIME_ZONE),
  scheduleRequestLimit: manualCollectionRequestLimitSchema,
}).superRefine((value, context) => {
  if (!value.scheduleCron) return
  const error = validateCollectionCron(value.scheduleCron, value.scheduleTimezone)
  if (error) context.addIssue({ code: 'custom', path: ['scheduleCron'], message: error })
})
export type UpdateSourceScheduleInput = z.infer<typeof updateSourceScheduleSchema>

export const updateSourceCatalogOptionsSchema = z.object({ sourceId: z.uuid(), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).or(z.literal('')), stockCardsEnabled: z.boolean(), robotsPolicy: z.enum(['respect', 'operator_approved']) })
export type UpdateSourceCatalogOptionsInput = z.infer<typeof updateSourceCatalogOptionsSchema>
