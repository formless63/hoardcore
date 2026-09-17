import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { categoryGroupOverrideInputSchema, deleteCategoryGroupOverrideInputSchema } from './category-overrides.schemas'
import { deleteCategoryGroupOverride as deleteCategoryGroupOverrideInDatabase, listCategoryGroupReview, saveCategoryGroupOverride as saveCategoryGroupOverrideInDatabase } from './category-overrides.server'

/** Category mappings are installation-wide operator settings, guarded server-side. */
export const getCategoryGroupReview = createServerFn({ method: 'GET' }).handler(async () => {
  await requireSession()
  setResponseHeader('Cache-Control', 'private, no-store')
  return listCategoryGroupReview(getDatabase())
})

export const saveCategoryGroupOverride = createServerFn({ method: 'POST' })
  .validator(categoryGroupOverrideInputSchema)
  .handler(async ({ data }) => {
    await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return saveCategoryGroupOverrideInDatabase(getDatabase(), data)
  })

export const deleteCategoryGroupOverride = createServerFn({ method: 'POST' })
  .validator(deleteCategoryGroupOverrideInputSchema)
  .handler(async ({ data }) => {
    await requireSession()
    setResponseHeader('Cache-Control', 'private, no-store')
    return deleteCategoryGroupOverrideInDatabase(getDatabase(), data)
  })
