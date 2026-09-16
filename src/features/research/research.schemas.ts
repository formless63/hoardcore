import { z } from 'zod'

/** Versions are intentionally explicit: imports must never silently reinterpret data. */
export const RESEARCH_PACKET_VERSION = '1.0'
export const RESEARCH_RESULT_VERSION = '1.0'
export const RESEARCH_PROMPT_VERSION = '1.0'

const nonEmpty = z.string().trim().min(1)
const timestamp = z.iso.datetime({ offset: true })

/** Immutable identity issued by Hoardcore; source-native IDs are not sufficient. */
export const researchEntityReferenceSchema = z.object({
  entityType: z.enum(['product', 'variant', 'source_listing']),
  hoardcoreId: nonEmpty,
})

export type ResearchEntityReference = z.output<typeof researchEntityReferenceSchema>

const jsonValueSchema = z.json()

/** A value observed from a source, retained separately from a researcher claim. */
export const sourceFactSchema = z.object({
  key: nonEmpty,
  value: jsonValueSchema,
  observedAt: timestamp,
  sourceUrl: z.url().optional(),
  evidenceId: nonEmpty.optional(),
})

export type SourceFact = z.output<typeof sourceFactSchema>

export const researchPacketRecordSchema = z.object({
  reference: researchEntityReferenceSchema,
  product: researchEntityReferenceSchema.optional(),
  variant: researchEntityReferenceSchema.optional(),
  listing: researchEntityReferenceSchema.optional(),
  sourceFacts: z.array(sourceFactSchema),
})

export type ResearchPacketRecord = z.output<typeof researchPacketRecordSchema>

export const researchPacketSchema = z.object({
  packetVersion: z.literal(RESEARCH_PACKET_VERSION),
  promptVersion: z.literal(RESEARCH_PROMPT_VERSION),
  schemaVersion: z.literal(RESEARCH_RESULT_VERSION),
  packetId: nonEmpty,
  createdAt: timestamp,
  records: z.array(researchPacketRecordSchema).min(1),
})

export type ResearchPacket = z.output<typeof researchPacketSchema>

export const citationSchema = z.object({
  citationId: nonEmpty,
  title: nonEmpty.optional(),
  url: z.url(),
  retrievedAt: timestamp.optional(),
  excerpt: nonEmpty.optional(),
})

export type ResearchCitation = z.output<typeof citationSchema>

export const researchClaimSchema = z.object({
  field: nonEmpty,
  value: jsonValueSchema,
  confidence: z.number().min(0).max(1).optional(),
  citationIds: z.array(nonEmpty).default([]),
})

export type ResearchClaim = z.output<typeof researchClaimSchema>

export const marketEstimateSchema = z.object({
  estimateType: z.enum(['market_value', 'sale_price', 'demand', 'liquidity']),
  amount: z.number().nonnegative().optional(),
  currency: z.string().trim().length(3).optional(),
  low: z.number().nonnegative().optional(),
  high: z.number().nonnegative().optional(),
  confidence: z.number().min(0).max(1).optional(),
  citationIds: z.array(nonEmpty).default([]),
})

export type MarketEstimate = z.output<typeof marketEstimateSchema>

export const researchRiskSchema = z.object({
  description: nonEmpty,
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  citationIds: z.array(nonEmpty).default([]),
})

export type ResearchRisk = z.output<typeof researchRiskSchema>

export const validationDiagnosticSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  code: nonEmpty,
  message: nonEmpty,
})

export type ValidationDiagnostic = z.output<typeof validationDiagnosticSchema>

export const researchResultRecordSchema = z.object({
  reference: researchEntityReferenceSchema,
  status: z.enum(['valid', 'partial', 'invalid']),
  claims: z.array(researchClaimSchema),
  marketEstimates: z.array(marketEstimateSchema),
  risks: z.array(researchRiskSchema),
  citations: z.array(citationSchema),
  diagnostics: z.array(validationDiagnosticSchema),
})

export type ResearchResultRecord = z.output<typeof researchResultRecordSchema>

export const researchResultSchema = z.object({
  resultVersion: z.literal(RESEARCH_RESULT_VERSION),
  packetVersion: z.literal(RESEARCH_PACKET_VERSION),
  promptVersion: z.literal(RESEARCH_PROMPT_VERSION),
  schemaVersion: z.literal(RESEARCH_RESULT_VERSION),
  packetId: nonEmpty,
  resultId: nonEmpty,
  completedAt: timestamp,
  records: z.array(researchResultRecordSchema).min(1),
})

export type ResearchResult = z.output<typeof researchResultSchema>

export function parseResearchPacket(input: unknown): ResearchPacket {
  return researchPacketSchema.parse(input)
}

export function parseResearchResult(input: unknown): ResearchResult {
  return researchResultSchema.parse(input)
}

