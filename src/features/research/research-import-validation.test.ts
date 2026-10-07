import { describe, expect, it } from 'vitest'
import { createResearchValidationTracker, researchValidationSummary } from './research-import-validation'
import type { ResearchPreview } from './research.preview'

describe('research import validation snapshots', () => {
  it('ignores a deferred validation after the operator replaces the payload', async () => {
    const tracker = createResearchValidationTracker()
    const packet = { packetId: 'packet-a' }
    let input = 'payload-a'
    const snapshot = tracker.capture(packet, input)
    let resolve!: (value: string) => void
    const response = new Promise<string>((done) => { resolve = done })
    let accepted: string | undefined
    const validation = response.then((value) => {
      if (tracker.isCurrent(snapshot, packet, input)) accepted = value
    })
    tracker.invalidate()
    input = 'payload-b'
    resolve('preview-a')
    await validation
    expect(accepted).toBeUndefined()
    expect(tracker.isCurrent(snapshot, packet, input)).toBe(false)
    const next = tracker.capture(packet, input)
    expect(tracker.isCurrent(next, packet, input)).toBe(true)
    expect(next.resultJson).toBe('payload-b')
  })

  it('requires revalidation even when edited JSON is restored to its original text', () => {
    const tracker = createResearchValidationTracker()
    const packet = {}
    const snapshot = tracker.capture(packet, 'original')
    tracker.invalidate()
    tracker.invalidate()
    expect(tracker.isCurrent(snapshot, packet, 'original')).toBe(false)
  })

  it('rejects responses for replaced packets or superseded requests', () => {
    const tracker = createResearchValidationTracker()
    const packet = {}
    const first = tracker.capture(packet, 'payload')
    expect(tracker.isCurrent(first, {}, 'payload')).toBe(false)
    const second = tracker.capture(packet, 'payload')
    expect(tracker.isCurrent(first, packet, 'payload')).toBe(false)
    expect(tracker.isCurrent(second, packet, 'payload')).toBe(true)
  })
})

describe('research validation completion feedback', () => {
  const diagnostic = { path: ['comparables', 0, 'price'], code: 'invalid_price', message: 'Price is required' }
  const preview: ResearchPreview = { rawInput: '{}', status: 'valid', diagnostics: [], records: [{ index: 0, status: 'valid', diagnostics: [] }] }

  it('announces valid completion and readiness to import', () => {
    expect(researchValidationSummary(preview)).toContain('1 record: 1 valid, 0 partial, 0 invalid. 0 diagnostics. Ready to import.')
  })

  it('includes record-level diagnostics and partial record counts', () => {
    const summary = researchValidationSummary({ ...preview, status: 'partial', records: [...preview.records, { index: 1, status: 'partial', diagnostics: [diagnostic] }] })
    expect(summary).toContain('Validation complete: partial. 2 records: 1 valid, 1 partial, 0 invalid. 1 diagnostic.')
    expect(summary).toContain('Review the record diagnostics before importing.')
  })

  it('counts top-level and record-level errors and explains invalid recovery', () => {
    const summary = researchValidationSummary({ ...preview, status: 'invalid', diagnostics: [diagnostic], records: [{ index: 0, status: 'invalid', diagnostics: [diagnostic] }] })
    expect(summary).toContain('0 valid, 0 partial, 1 invalid. 2 diagnostics.')
    expect(summary).toContain('Resolve the diagnostics and validate again before importing.')
  })
})
