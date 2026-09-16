import { describe, expect, it } from 'vitest'
import { createCatalogSourceInputSchema } from './sources.schemas'

describe('catalog source input', () => {
  it('trims operator-facing names', () => {
    const result = createCatalogSourceInputSchema.parse({
      displayName: '  Example shop  ',
      moduleId: 'shopify',
      config: { catalogUrl: 'example.myshopify.com' },
    })

    expect(result.displayName).toBe('Example shop')
  })

  it('rejects missing names and module identifiers', () => {
    expect(
      createCatalogSourceInputSchema.safeParse({
        displayName: '',
        moduleId: '',
        config: {},
      }).success,
    ).toBe(false)
  })
})
