import { z } from 'zod'

export const cooldownReleaseInputSchema = z.object({
  sourceId: z.uuid(),
  confirmed: z.literal(true, 'Confirm that you want to release this cooldown early'),
  reason: z.string().trim().min(3, 'Enter a reason for releasing the cooldown').max(500),
  resume: z.boolean().default(false),
  expectedBlockedUntil: z.iso.datetime().nullable(),
  expectedPaused: z.boolean(),
})
