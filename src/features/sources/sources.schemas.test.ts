import { describe, expect, it } from 'vitest'
import { createCatalogSourceInputSchema, manualCollectionRequestLimitSchema, updateSourceScheduleSchema } from './sources.schemas'

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

describe('source schedule input', () => {
  it('accepts a timezone-aware twice-daily schedule', () => {
    expect(updateSourceScheduleSchema.parse({ sourceId: crypto.randomUUID(), collectionEnabled: true, scheduleCron: '0 9,21 * * *', scheduleTimezone: 'America/New_York', scheduleRequestLimit: 10 })).toMatchObject({ scheduleCron: '0 9,21 * * *' })
  })

  it('rejects collection schedules that are too frequent', () => {
    expect(updateSourceScheduleSchema.safeParse({ sourceId: crypto.randomUUID(), collectionEnabled: true, scheduleCron: '*/5 * * * *', scheduleTimezone: 'UTC', scheduleRequestLimit: 10 }).success).toBe(false)
  })
})
