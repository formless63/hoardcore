import { describe, expect, it } from 'vitest'
import {
  parseResearchPacket,
  parseResearchResult,
  RESEARCH_PACKET_VERSION,
  RESEARCH_PROMPT_VERSION,
  RESEARCH_RESULT_VERSION,
} from './research.schemas'

const reference = { entityType: 'source_listing' as const, hoardcoreId: 'listing-immutable-1' }
const packet = {
  packetVersion: RESEARCH_PACKET_VERSION,
  promptVersion: RESEARCH_PROMPT_VERSION,
  schemaVersion: RESEARCH_RESULT_VERSION,
  packetId: 'packet-1',
  createdAt: '2026-09-16T05:00:00Z',
  records: [{
    reference,
    product: { entityType: 'product' as const, hoardcoreId: 'product-1' },
    variant: { entityType: 'variant' as const, hoardcoreId: 'variant-1' },
    listing: reference,
    sourceFacts: [{
      key: 'current_price', value: 42.5, observedAt: '2026-09-16T04:59:00Z', sourceUrl: 'https://shop.example/items/1',
    }],
  }],
}

describe('research interchange contracts', () => {
  it('round-trips a packet and a partial result through JSON', () => {
    const parsedPacket = parseResearchPacket(JSON.parse(JSON.stringify(packet)))
    const result = {
      resultVersion: RESEARCH_RESULT_VERSION,
      packetVersion: RESEARCH_PACKET_VERSION,
      promptVersion: RESEARCH_PROMPT_VERSION,
      schemaVersion: RESEARCH_RESULT_VERSION,
      packetId: parsedPacket.packetId,
      resultId: 'result-1',
      completedAt: '2026-09-16T06:00:00Z',
      records: [{
        reference,
        status: 'partial' as const,
        claims: [{ field: 'demand', value: 'steady', citationIds: ['citation-1'] }],
        marketEstimates: [],
        risks: [{ description: 'Small market sample', severity: 'medium' as const, citationIds: [] }],
        citations: [{ citationId: 'citation-1', url: 'https://research.example/item-1' }],
        diagnostics: [{ path: ['claims', 1], code: 'missing', message: 'Optional claim was not provided' }],
      }],
    }
    expect(parseResearchResult(JSON.parse(JSON.stringify(result)))).toEqual(result)
  })

  it('rejects incompatible packet and result versions clearly', () => {
    expect(() => parseResearchPacket({ ...packet, packetVersion: '2.0' })).toThrow(/packetVersion/u)
    expect(() => parseResearchResult({
      resultVersion: RESEARCH_RESULT_VERSION, packetVersion: '2.0', promptVersion: RESEARCH_PROMPT_VERSION,
      schemaVersion: RESEARCH_RESULT_VERSION, packetId: 'p', resultId: 'r', completedAt: packet.createdAt,
      records: [],
    })).toThrow(/packetVersion/u)
  })

  it('accepts per-record partial/invalid diagnostics without losing the payload', () => {
    const result = {
      resultVersion: RESEARCH_RESULT_VERSION, packetVersion: RESEARCH_PACKET_VERSION,
      promptVersion: RESEARCH_PROMPT_VERSION, schemaVersion: RESEARCH_RESULT_VERSION,
      packetId: 'p', resultId: 'r', completedAt: packet.createdAt,
      records: [{ reference, status: 'invalid' as const, claims: [], marketEstimates: [], risks: [], citations: [],
        diagnostics: [{ path: ['marketEstimates'], code: 'invalid_type', message: 'Expected an array' }] }],
    }
    expect(parseResearchResult(result).records[0]?.diagnostics[0]?.code).toBe('invalid_type')
  })

  it('keeps source facts structurally distinct from normalized claims', () => {
    const parsed = parseResearchPacket(packet)
    expect(parsed.records[0]?.sourceFacts[0]).toHaveProperty('observedAt')
    expect(() => parseResearchPacket({ ...packet, records: [{ ...packet.records[0], sourceFacts: [{ field: 'demand', value: 'high' }] }] })).toThrow(/key/u)
  })
})

