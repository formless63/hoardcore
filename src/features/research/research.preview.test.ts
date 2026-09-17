import { describe, expect, it } from 'vitest'
import { createResearchBatchExport } from './research.batch'
import { previewResearchResult } from './research.preview'
import { marketComparableSchema } from './research.schemas'
import type { NormalizedCatalogRecord } from '~/modules/types'

const catalogRecord: NormalizedCatalogRecord = {
  product: { productKey: 'p-1', title: 'Product', tags: [] },
  variant: { variantKey: 'v-1', productKey: 'p-1', available: true },
  listing: {
    listingKey: 'l-1', sourceKey: 'source-1', productKey: 'p-1', variantKey: 'v-1',
    url: 'https://example.com/item', current: { title: 'Product', available: true },
    observedAt: '2026-09-16T05:00:00Z',
  },
}

function expected() {
  return createResearchBatchExport([catalogRecord], { createdAt: '2026-09-16T06:00:00Z' }).packet
}

function validResult(packet: ReturnType<typeof expected>) {
  return {
    resultVersion: '1.0', packetVersion: packet.packetVersion, promptVersion: packet.promptVersion,
    schemaVersion: packet.schemaVersion, packetId: packet.packetId, resultId: 'result-1',
    completedAt: '2026-09-16T07:00:00Z',
    records: [{ reference: packet.records[0]!.reference, status: 'valid', claims: [], marketEstimates: [], risks: [], citations: [], diagnostics: [] }],
  }
}

describe('research result preview reconciliation', () => {
  it('round-trips valid pasted JSON and preserves the exact raw input', () => {
    const packet = expected()
    const raw = JSON.stringify(validResult(packet), null, 2)
    const preview = previewResearchResult(raw, packet)
    expect(preview.status).toBe('valid')
    expect(preview.rawInput).toBe(raw)
    expect(preview.records[0]?.record?.reference).toEqual(packet.records[0]?.reference)
  })

  it('classifies malformed JSON and malformed records without dropping them', () => {
    const packet = expected()
    expect(previewResearchResult('{nope', packet).diagnostics[0]?.code).toBe('invalid_json')
    const candidate = { ...validResult(packet), records: [{ reference: packet.records[0]!.reference, status: 'valid' }] }
    const preview = previewResearchResult(JSON.stringify(candidate), packet)
    expect(preview.status).toBe('invalid')
    expect(preview.records).toHaveLength(1)
    expect(preview.records[0]?.status).toBe('invalid')
  })

  it('reports packet/version mismatch at top level', () => {
    const packet = expected()
    const candidate = { ...validResult(packet), packetId: 'another-packet', packetVersion: '9.0' }
    const preview = previewResearchResult(candidate, packet)
    expect(preview.status).toBe('invalid')
    expect(preview.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(['packet_mismatch', 'version_mismatch']))
  })

  it('reports unknown and duplicate references while retaining every record', () => {
    const packet = expected()
    const base = validResult(packet).records[0]!
    const candidate = {
      ...validResult(packet),
      records: [base, base, { ...base, reference: { entityType: 'product', hoardcoreId: 'not-in-packet' } }],
    }
    const preview = previewResearchResult(candidate, packet)
    expect(preview.records).toHaveLength(3)
    expect(preview.records[1]?.diagnostics[0]?.code).toBe('duplicate_reference')
    expect(preview.records[2]?.diagnostics[0]?.code).toBe('unknown_reference')
    expect(preview.records.every((record) => record.record || record.diagnostics.length > 0)).toBe(true)
  })

  it('rejects duplicate comparable IDs across records before persistence', () => {
    const packet = expected()
    const comparable = { comparableId: 'same-id', channel: 'Marketplace', evidenceType: 'completed_sale', price: 12, currency: 'USD' }
    const base = { ...validResult(packet).records[0]!, comparables: [comparable] }
    const preview = previewResearchResult({ ...validResult(packet), records: [base, base] }, packet)
    expect(preview.status).toBe('invalid')
    expect(preview.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'duplicate_comparable_id' })]))
  })

  it('keeps comparable amounts within the database precision', () => {
    const comparable = { comparableId: 'c1', channel: 'Marketplace', evidenceType: 'completed_sale', price: 45.99, currency: 'USD' }
    expect(marketComparableSchema.safeParse(comparable).success).toBe(true)
    expect(marketComparableSchema.safeParse({ ...comparable, price: 45.999 }).success).toBe(false)
    expect(marketComparableSchema.safeParse({ ...comparable, price: 1_000_000_000_000 }).success).toBe(false)
    expect(marketComparableSchema.safeParse({ ...comparable, sampleSize: 2_147_483_648 }).success).toBe(false)
  })
})
