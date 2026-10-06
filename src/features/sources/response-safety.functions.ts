import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { readSourceSafety, saveSourceSafetyInDatabase, setSourceSafetyBreakInDatabase, releaseSourceCooldownInDatabase } from './response-safety.server'
import { cooldownReleaseInputSchema } from './cooldown-release.schemas'
import { responseEventTypes, responsePolicySchema } from './response-policy'
import { enqueueCatalogCollectionInDatabase } from './runs.server'

const sourceInput = z.object({ sourceId: z.uuid() })
export const releaseSourceCooldown = createServerFn({ method: 'POST' }).validator(cooldownReleaseInputSchema).handler(async ({ data }) => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return releaseSourceCooldownInDatabase(getDatabase(), session.user.id, data)
})
/** Includes any required preflight in its single-request budget; never bypasses safety gates. */
export const requestSourceSafetyProbe = createServerFn({ method: 'POST' }).validator(sourceInput).handler(async ({ data }) => {
  await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return enqueueCatalogCollectionInDatabase(data.sourceId, 1)
})
export const getSourceSafety = createServerFn({ method: 'GET' }).validator(sourceInput).handler(async ({ data }) => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return readSourceSafety(getDatabase(), data.sourceId, session.user.id)
})
export const saveSourceSafety = createServerFn({ method: 'POST' }).validator(sourceInput.extend({
  policy: responsePolicySchema, eventTypes: z.array(z.enum(responseEventTypes)).max(responseEventTypes.length),
})).handler(async ({ data }) => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return saveSourceSafetyInDatabase(getDatabase(), session.user.id, data)
})
export const setSourceSafetyBreak = createServerFn({ method: 'POST' }).validator(sourceInput.extend({
  action: z.enum(['break', 'pause', 'resume']), hours: z.number().min(1).max(8760).default(72),
})).handler(async ({ data }) => {
  const session = await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return setSourceSafetyBreakInDatabase(getDatabase(), session.user.id, data)
})
