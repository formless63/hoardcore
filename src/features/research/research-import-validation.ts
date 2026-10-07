import type { ResearchPreview } from './research.preview'

export function createResearchValidationTracker() {
  let revision = 0
  return {
    invalidate() { revision += 1 },
    capture(packet: unknown, resultJson: string) { return { packet, resultJson, revision: ++revision } },
    isCurrent(snapshot: { packet: unknown; resultJson: string; revision: number }, packet: unknown, resultJson: string) {
      return snapshot.revision === revision && snapshot.packet === packet && snapshot.resultJson === resultJson
    },
  }
}

export function researchValidationSummary(preview: ResearchPreview) {
  const counts = { valid: 0, partial: 0, invalid: 0 }
  for (const record of preview.records) counts[record.status] += 1
  const diagnostics = preview.diagnostics.length + preview.records.reduce((total, record) => total + record.diagnostics.length, 0)
  return `Validation complete: ${preview.status}. ${preview.records.length} record${preview.records.length === 1 ? '' : 's'}: ${counts.valid} valid, ${counts.partial} partial, ${counts.invalid} invalid. ${diagnostics} diagnostic${diagnostics === 1 ? '' : 's'}.${preview.status === 'invalid' ? ' Resolve the diagnostics and validate again before importing.' : preview.status === 'partial' ? ' Review the record diagnostics before importing.' : ' Ready to import.'}`
}
