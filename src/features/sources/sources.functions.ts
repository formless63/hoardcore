import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import {
  createCatalogSourceInDatabase,
  listCatalogSourcesFromDatabase,
  updateSourceScheduleInDatabase,
  updateSourceCatalogOptionsInDatabase,
} from './sources.server'
import { createCatalogSourceInputSchema } from './sources.schemas'
import { interPageWaitMsSchema, manualCollectionRequestLimitSchema } from './sources.schemas'
import { updateSourceScheduleSchema, updateSourceCatalogOptionsSchema } from './sources.schemas'
import { withRequiredSession } from '~/server/auth.server'
import { continueDeferredCollectionInDatabase, enqueueCatalogCollectionInDatabase, getCollectionRunFromDatabase, listCollectionRunsFromDatabase } from './runs.server'
import { z } from 'zod'

export const listCatalogSources = createServerFn({ method: 'GET' }).handler(async () => {
  return withRequiredSession(async () => {
    setResponseHeader('Cache-Control', 'private, no-store')
    return listCatalogSourcesFromDatabase()
  })
})

export const createCatalogSource = createServerFn({ method: 'POST' })
  .validator(createCatalogSourceInputSchema)
  .handler(async ({ data }) => {
    return withRequiredSession(async () => {
      setResponseHeader('Cache-Control', 'private, no-store')
      return createCatalogSourceInDatabase(data)
    })
  })

export const updateSourceSchedule = createServerFn({ method: 'POST' })
  .validator(updateSourceScheduleSchema)
  .handler(async ({ data }) => withRequiredSession(async () => {
    setResponseHeader('Cache-Control', 'private, no-store')
    return updateSourceScheduleInDatabase(data)
  }))

export const updateSourceCatalogOptions = createServerFn({ method: 'POST' }).validator(updateSourceCatalogOptionsSchema).handler(async ({ data }) => withRequiredSession(async () => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return updateSourceCatalogOptionsInDatabase(data)
}))

export const listCollectionRuns = createServerFn({ method: 'GET' })
  .validator(z.object({ sourceId: z.uuid().optional() }))
  .handler(async ({ data }) => {
    return withRequiredSession(async () => {
      setResponseHeader('Cache-Control', 'private, no-store')
      return listCollectionRunsFromDatabase(data.sourceId)
    })
  })

export const enqueueCatalogCollection = createServerFn({ method: 'POST' })
  .validator(z.object({ sourceId: z.uuid(), requestLimit: manualCollectionRequestLimitSchema, interPageWaitMs: interPageWaitMsSchema.default(0) }))
  .handler(async ({ data }) => {
    return withRequiredSession(async () => {
      setResponseHeader('Cache-Control', 'private, no-store')
      return enqueueCatalogCollectionInDatabase(data.sourceId, data.requestLimit, data.interPageWaitMs)
    })
  })

export const getCollectionRun = createServerFn({ method: 'GET' })
  .validator(z.object({ runId: z.uuid() }))
  .handler(async ({ data }) => withRequiredSession(async () => {
    setResponseHeader('Cache-Control', 'private, no-store')
    return getCollectionRunFromDatabase(data.runId)
  }))

export const continueDeferredCollection = createServerFn({ method: 'POST' })
  .validator(z.object({ runId: z.uuid() }))
  .handler(async ({ data }) => withRequiredSession(async () => {
    setResponseHeader('Cache-Control', 'private, no-store')
    return continueDeferredCollectionInDatabase(data.runId)
  }))
