import type { NormalizedCatalogRecord } from '~/modules/types'
import {
  parseResearchPacket,
  researchPacketSchema,
  type ResearchPacket,
} from './research.schemas'

export interface ResearchBatchOptions {
  /** Injected for deterministic exports and tests; production uses the current time. */
  createdAt?: string
}

export interface ResearchBatchExport {
  packet: ResearchPacket
  packetJson: string
  prompt: string
}
export type ResearchCatalogRecord = NormalizedCatalogRecord & { evidenceId?: string }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

// A small deterministic digest keeps packet IDs stable across retries without
// introducing a provider, database, or random identifier dependency.
function digest(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).padStart(7, '0')
}

function fact(
  key: string,
  value: unknown,
  observedAt: string,
  sourceUrl?: string,
) {
  if (value === undefined) return undefined
  return { key, value, observedAt, ...(sourceUrl ? { sourceUrl } : {}) }
}

function packetFromSelection(
  records: ResearchCatalogRecord[],
  createdAt: string,
): ResearchPacket {
  const selected = records.map((record) => ({
    product: record.product,
    variant: record.variant,
    listing: record.listing,
  }))
  const packetId = `packet-${digest(stableJson({ createdAt, selected }))}`

  return parseResearchPacket({
    packetVersion: '1.0',
    promptVersion: '1.0',
    schemaVersion: '1.0',
    packetId,
    createdAt,
    records: records.map((record) => {
      const observedAt = record.listing.observedAt ?? createdAt
      const sourceUrl = record.listing.url
      const sourceFacts = [
        fact('product.title', record.product.title, observedAt, sourceUrl),
        fact('product.description', record.product.description, observedAt, sourceUrl),
        fact('product.brand', record.product.brand, observedAt, sourceUrl),
        fact('product.type', record.product.productType, observedAt, sourceUrl),
        fact('product.tags', record.product.tags, observedAt, sourceUrl),
        fact('product.image_urls', record.product.imageUrls, observedAt, sourceUrl),
        fact('variant.title', record.variant.title, observedAt, sourceUrl),
        fact('variant.sku', record.variant.sku, observedAt, sourceUrl),
        fact('variant.barcode', record.variant.barcode, observedAt, sourceUrl),
        fact('variant.price', record.variant.price, observedAt, sourceUrl),
        fact('variant.currency', record.variant.currency, observedAt, sourceUrl),
        fact('variant.available', record.variant.available, observedAt, sourceUrl),
        fact('listing.source_key', record.listing.sourceKey, observedAt, sourceUrl),
        fact('listing.current', record.listing.current, observedAt, sourceUrl),
        fact('listing.evidence_id', record.evidenceId, observedAt, sourceUrl),
      ].filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)

      return {
        reference: { entityType: 'source_listing', hoardcoreId: record.listing.listingKey },
        product: { entityType: 'product', hoardcoreId: record.product.productKey },
        variant: { entityType: 'variant', hoardcoreId: record.variant.variantKey },
        listing: { entityType: 'source_listing', hoardcoreId: record.listing.listingKey },
        sourceFacts,
      }
    }),
  })
}

export function renderResearchPrompt(packet: ResearchPacket, packetJson: string): string {
  return [
    'You are returning structured research for Hoardcore.',
    `Return a JSON object conforming exactly to ResearchResult version ${packet.schemaVersion}.`,
    `Use packetVersion ${packet.packetVersion} and promptVersion ${packet.promptVersion}.`,
    'Treat every sourceFacts value as a collected fact, not as a research claim.',
    'Add normalized claims only when supported by your research and include citation IDs for claims and estimates.',
    'Do not invent, change, or omit packetId, result references, product IDs, variant IDs, or listing IDs.',
    'If a record cannot be completed, retain its immutable reference, mark status partial or invalid, and add diagnostics.',
    'Return citations with URLs. Do not include prose outside the JSON result.',
    '',
    'ResearchPacket JSON:',
    packetJson,
  ].join('\n')
}

export function createResearchBatchExport(
  records: ResearchCatalogRecord[],
  options: ResearchBatchOptions = {},
): ResearchBatchExport {
  if (records.length === 0) throw new Error('At least one catalog record is required')
  const createdAt = options.createdAt ?? new Date().toISOString()
  const packet = packetFromSelection(records, createdAt)
  const packetJson = JSON.stringify(researchPacketSchema.parse(packet), null, 2)
  return { packet, packetJson, prompt: renderResearchPrompt(packet, packetJson) }
}
