import { describe, expect, it } from 'vitest'
import { createResearchBatchExport } from './research.batch'
import { parseResearchPacket } from './research.schemas'
import type { NormalizedCatalogRecord } from '~/modules/types'

const record: NormalizedCatalogRecord = {
  product: {
    productKey: 'source-a:product-1', title: 'Example Product', description: 'Collected description',
    brand: 'Example Brand', productType: 'Collectible', tags: ['featured'],
  },
  variant: {
    variantKey: 'source-a:variant-1', productKey: 'source-a:product-1', title: 'Default',
    sku: 'SKU-1', price: 42, currency: 'USD', available: true,
  },
  listing: {
    listingKey: 'source-a:listing-1', sourceKey: 'registered-source-a', productKey: 'source-a:product-1',
    variantKey: 'source-a:variant-1', url: 'https://catalog.example/products/1',
    current: { title: 'Example Product', price: 42, currency: 'USD', available: true },
    observedAt: '2026-09-16T05:00:00Z',
  },
}

describe('research batch export', () => {
  it('creates a deterministic packet ID and round-trips its JSON', () => {
    const options = { createdAt: '2026-09-16T06:00:00Z' }
    const first = createResearchBatchExport([record], options)
    const second = createResearchBatchExport([record], options)
    expect(first.packet.packetId).toBe(second.packet.packetId)
    expect(parseResearchPacket(JSON.parse(first.packetJson))).toEqual(first.packet)
    expect(first.packet.records[0]?.sourceFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'variant.price', value: 42 }),
    ]))
  })

  it('renders provider-neutral instructions that preserve references and provenance', () => {
    const exported = createResearchBatchExport([record], { createdAt: '2026-09-16T06:00:00Z' })
    expect(exported.prompt).toContain('ResearchResult version 1.0')
    expect(exported.prompt).toContain('sourceFacts value as a collected fact')
    expect(exported.prompt).toContain('Do not invent, change, or omit packetId')
    expect(exported.prompt).toContain('https://catalog.example/products/1')
    expect(exported.prompt).not.toMatch(/ChatGPT|Claude|Gemini|OpenAI|Anthropic/iu)
  })

  it('rejects an empty selection instead of producing an unusable packet', () => {
    expect(() => createResearchBatchExport([])).toThrow('At least one catalog record is required')
  })
})

