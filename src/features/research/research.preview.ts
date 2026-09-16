import {
  researchResultRecordSchema,
  researchResultSchema,
  type ResearchPacket,
  type ResearchResult,
  type ResearchResultRecord,
  type ValidationDiagnostic,
} from './research.schemas'

export type ResearchPreviewStatus = 'valid' | 'partial' | 'invalid'

export interface ResearchPreviewRecord {
  index: number
  record?: ResearchResultRecord
  status: ResearchPreviewStatus
  diagnostics: ValidationDiagnostic[]
}

export interface ResearchPreview {
  rawInput: string
  result?: ResearchResult
  status: ResearchPreviewStatus
  diagnostics: ValidationDiagnostic[]
  records: ResearchPreviewRecord[]
}

function diagnostic(
  path: (string | number)[],
  code: string,
  message: string,
): ValidationDiagnostic {
  return { path, code, message }
}

function diagnosticPath(path: readonly PropertyKey[]): (string | number)[] {
  return path.map((part) => (typeof part === 'string' || typeof part === 'number' ? part : String(part))) as (string | number)[]
}

function rawText(input: string | unknown): string {
  return typeof input === 'string' ? input : JSON.stringify(input)
}

function parseInput(input: string | unknown): { raw: string; value?: unknown; error?: ValidationDiagnostic } {
  const raw = rawText(input)
  if (typeof input !== 'string') return { raw, value: input }
  try {
    return { raw, value: JSON.parse(input) }
  } catch {
    return { raw, error: diagnostic([], 'invalid_json', 'Input is not valid JSON') }
  }
}

function resultStatus(records: ResearchPreviewRecord[], diagnostics: ValidationDiagnostic[]): ResearchPreviewStatus {
  if (records.some((record) => record.status === 'invalid') || diagnostics.length > 0) return 'invalid'
  if (records.some((record) => record.status === 'partial')) return 'partial'
  return 'valid'
}

/**
 * Validate pasted JSON and reconcile its records with the exact packet that
 * produced it. This is deliberately non-mutating and keeps raw input intact.
 */
export function previewResearchResult(
  input: string | unknown,
  expectedPacket: ResearchPacket,
): ResearchPreview {
  const parsedInput = parseInput(input)
  if (parsedInput.error) {
    return { rawInput: parsedInput.raw, status: 'invalid', diagnostics: [parsedInput.error], records: [] }
  }

  if (!parsedInput.value || typeof parsedInput.value !== 'object') {
    const issue = diagnostic([], 'invalid_result', 'Research result must be a JSON object')
    return { rawInput: parsedInput.raw, status: 'invalid', diagnostics: [issue], records: [] }
  }

  const candidate = parsedInput.value as Record<string, unknown>
  const diagnostics: ValidationDiagnostic[] = []
  const expectedVersions = {
    packetVersion: expectedPacket.packetVersion,
    promptVersion: expectedPacket.promptVersion,
    schemaVersion: expectedPacket.schemaVersion,
  }
  for (const [key, expected] of Object.entries(expectedVersions)) {
    if (candidate[key] !== expected) {
      diagnostics.push(diagnostic([key], 'version_mismatch', `Expected ${key} ${expected}`))
    }
  }
  if (candidate.packetId !== expectedPacket.packetId) {
    diagnostics.push(diagnostic(['packetId'], 'packet_mismatch', `Expected packet ${expectedPacket.packetId}`))
  }

  const expectedReferences = new Set(
    expectedPacket.records.map((record) => `${record.reference.entityType}:${record.reference.hoardcoreId}`),
  )
  const seenReferences = new Set<string>()
  const records: ResearchPreviewRecord[] = []
  const rawRecords = Array.isArray(candidate.records) ? candidate.records : []
  if (!Array.isArray(candidate.records)) {
    diagnostics.push(diagnostic(['records'], 'invalid_type', 'Expected records to be an array'))
  }

  rawRecords.forEach((rawRecord, index) => {
    const parsedRecord = researchResultRecordSchema.safeParse(rawRecord)
    if (!parsedRecord.success) {
      const recordDiagnostics = parsedRecord.error.issues.map((issue) =>
        diagnostic(['records', index, ...diagnosticPath(issue.path)], issue.code, issue.message),
      )
      records.push({ index, status: 'invalid', diagnostics: recordDiagnostics })
      return
    }

    const record = parsedRecord.data
    const key = `${record.reference.entityType}:${record.reference.hoardcoreId}`
    const recordDiagnostics: ValidationDiagnostic[] = []
    if (!expectedReferences.has(key)) {
      recordDiagnostics.push(diagnostic(
        ['records', index, 'reference'],
        'unknown_reference',
        'Reference is not present in the expected ResearchPacket',
      ))
    }
    if (seenReferences.has(key)) {
      recordDiagnostics.push(diagnostic(
        ['records', index, 'reference'],
        'duplicate_reference',
        'Reference appears more than once in this result',
      ))
    }
    seenReferences.add(key)
    records.push({
      index,
      record,
      status: recordDiagnostics.length === 0 ? 'valid' : 'partial',
      diagnostics: recordDiagnostics,
    })
  })

  const parsedResult = researchResultSchema.safeParse(candidate)
  const result = parsedResult.success ? parsedResult.data : undefined
  if (!parsedResult.success) {
    for (const issue of parsedResult.error.issues) {
      // Record-level shape errors are already attached to their retained
      // preview record; top-level errors still need a durable diagnostic.
      if (issue.path[0] !== 'records') {
        diagnostics.push(diagnostic(diagnosticPath(issue.path), issue.code, issue.message))
      }
    }
    if (!result && records.length === 0 && rawRecords.length === 0) {
      diagnostics.push(diagnostic(['records'], 'invalid_result', 'Research result must contain at least one record'))
    }
  }
  return {
    rawInput: parsedInput.raw,
    result,
    status: resultStatus(records, diagnostics),
    diagnostics,
    records,
  }
}
