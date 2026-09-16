import { describe, expect, it } from 'vitest'
import { createCatalogSourceInputSchema, manualCollectionRequestLimitSchema } from './sources.schemas'

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

describe('manual collection ceiling', () => {
  it('requires an explicit bounded whole number', () => {
    expect(manualCollectionRequestLimitSchema.parse(6)).toBe(6)
    expect(manualCollectionRequestLimitSchema.safeParse(1).success).toBe(false)
    expect(manualCollectionRequestLimitSchema.safeParse(21).success).toBe(false)
    expect(manualCollectionRequestLimitSchema.safeParse(3.5).success).toBe(false)
  })
})
