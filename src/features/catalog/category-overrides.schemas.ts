import { z } from 'zod'
import { categoryGroups, unmappedCategoryGroup } from './category-groups'

export const categoryGroupIdSchema = z.string().refine(
  (value) => value === unmappedCategoryGroup.id || categoryGroups.some((group) => group.id === value),
  'Unknown category group',
)

export const categoryGroupOverrideInputSchema = z.object({
  sourceId: z.uuid(),
  sourceCategory: z.string().trim().min(1).max(300),
  categoryGroup: categoryGroupIdSchema,
})

export const deleteCategoryGroupOverrideInputSchema = categoryGroupOverrideInputSchema.pick({ sourceId: true, sourceCategory: true })
