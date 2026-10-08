import { z } from 'zod'

export const changeKinds = ['new', 'missing', 'reappeared', 'price_drop', 'price_increase', 'price_changed', 'stock_changed', 'currency_changed'] as const
export const changeLabels: Record<typeof changeKinds[number], string> = { new: 'New listings', missing: 'Missing listings', reappeared: 'Reappeared', price_drop: 'Price drops', price_increase: 'Price increases', price_changed: 'Any price change', stock_changed: 'Stock changes', currency_changed: 'Currency changes' }
export const changesSearchSchema = z.object({
  mode: z.enum(['recent', 'runs']).default('recent'),
  sourceId: z.uuid().optional(), beforeRunId: z.uuid().optional(), afterRunId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
  days: z.coerce.number().int().min(1).max(36500).default(7),
  kind: z.enum(['all', ...changeKinds]).default('all'),
  query: z.string().trim().max(200).default(''),
  sort: z.enum(['recent', 'drop', 'increase', 'percent']).default('recent'),
  page: z.coerce.number().int().min(0).max(1000000).default(0),
  pageSize: z.union([z.literal(50), z.literal(100), z.literal(200)]).default(50),
}).superRefine((value, ctx) => {
  if (value.from && value.to && Date.parse(value.from) >= Date.parse(value.to)) ctx.addIssue({ code: 'custom', path: ['to'], message: 'End must be later than start.' })
})
export type ChangesSearch = z.output<typeof changesSearchSchema>
