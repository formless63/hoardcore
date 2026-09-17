import { describe, expect, it } from 'vitest'
import { resolvedCategoryGroup } from './category-overrides.server'

describe('source category group overrides', () => {
  it('uses an explicit source mapping before starter category matching', () => {
    expect(resolvedCategoryGroup('Load Centers - Copper Bus')).toBe('distribution')
    expect(resolvedCategoryGroup('Load Centers - Copper Bus', 'tools')).toBe('tools')
  })

  it('can explicitly leave a normally grouped category unmapped', () => {
    expect(resolvedCategoryGroup('Lighting Fixtures', 'unmapped')).toBe('unmapped')
  })
})
