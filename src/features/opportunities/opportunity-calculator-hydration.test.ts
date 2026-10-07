import { describe, expect, it } from 'vitest'
import { calculatorDraftReducer, canSaveCalculatorDraft, createCalculatorDraft } from './opportunity-calculator-hydration'
import type { OpportunityInputsWithProvenance } from './opportunity.schemas'

function inputs(acquisitionCost: number): OpportunityInputsWithProvenance {
  const sourced = (value: number | null) => ({ value, provenance: { kind: 'operator_override' as const } })
  return {
    quantity: sourced(1), acquisitionCost: sourced(acquisitionCost), estimatedMarketValue: sourced(null),
    platformFeePercent: sourced(0), paymentFeePercent: sourced(0), shipping: sourced(0),
    tax: sourced(0), handling: sourced(0), otherCosts: sourced(0), downsidePercent: sourced(0),
  }
}

describe('opportunity calculator hydration', () => {
  it('does not permit saving defaults before the initial read succeeds', () => {
    const draft = createCalculatorDraft(inputs(10), 'USD', true)
    expect(canSaveCalculatorDraft(draft)).toBe(false)
    const failed = calculatorDraftReducer(draft, { type: 'load-error' })
    expect(canSaveCalculatorDraft(failed)).toBe(false)
    expect(canSaveCalculatorDraft(calculatorDraftReducer(failed, { type: 'load-start' }))).toBe(false)
  })

  it('hydrates an untouched draft with the existing assumptions and currency', () => {
    const saved = { inputs: inputs(35), currency: 'EUR' }
    const draft = calculatorDraftReducer(createCalculatorDraft(inputs(10), 'USD', true), { type: 'loaded', saved })
    expect(draft.inputs).toEqual(saved.inputs)
    expect(draft.currency).toBe('EUR')
    expect(canSaveCalculatorDraft(draft)).toBe(true)
  })

  it('keeps value, source, and currency edits made while a read is deferred, hydrating untouched fields', async () => {
    const savedInputs = inputs(35)
    savedInputs.shipping = { value: 8, provenance: { kind: 'research_comparable', reference: 'comparable-1' } }
    const saved = { inputs: savedInputs, currency: 'EUR' }
    let resolveRead!: (result: typeof saved) => void
    const read = new Promise<typeof saved>((resolve) => { resolveRead = resolve })
    let draft = calculatorDraftReducer(createCalculatorDraft(inputs(10), 'USD', true), { type: 'load-start' })
    const hydrate = read.then((result) => { draft = calculatorDraftReducer(draft, { type: 'loaded', saved: result }) })
    draft = calculatorDraftReducer(draft, { type: 'value', key: 'acquisitionCost', value: 12 })
    draft = calculatorDraftReducer(draft, { type: 'source', key: 'shipping', kind: 'operator_override' })
    draft = calculatorDraftReducer(draft, { type: 'currency', currency: 'GBP' })
    expect(canSaveCalculatorDraft(draft)).toBe(false)
    resolveRead(saved)
    await hydrate
    expect(draft.inputs.acquisitionCost.value).toBe(12)
    expect(draft.inputs.shipping).toEqual({ value: 8, provenance: { kind: 'operator_override' } })
    expect(draft.currency).toBe('GBP')
    expect(canSaveCalculatorDraft(draft)).toBe(true)
  })

  it('preserves zero and cleared values, including edits made after a failed read, across retry', () => {
    let draft = calculatorDraftReducer(createCalculatorDraft(inputs(10), 'USD', true), { type: 'load-error' })
    draft = calculatorDraftReducer(draft, { type: 'value', key: 'acquisitionCost', value: 0 })
    draft = calculatorDraftReducer(draft, { type: 'value', key: 'shipping', value: null })
    draft = calculatorDraftReducer(draft, { type: 'currency', currency: null })
    draft = calculatorDraftReducer(draft, { type: 'load-start' })
    expect(canSaveCalculatorDraft(draft)).toBe(false)
    draft = calculatorDraftReducer(draft, { type: 'loaded', saved: { inputs: inputs(35), currency: 'EUR' } })
    expect(draft.inputs.acquisitionCost.value).toBe(0)
    expect(draft.inputs.shipping.value).toBeNull()
    expect(draft.currency).toBeNull()
    expect(canSaveCalculatorDraft(draft)).toBe(true)
  })

  it('permits saving a new scenario only after a successful read confirms no existing assumptions', () => {
    let draft = createCalculatorDraft(inputs(10), 'USD', true)
    draft = calculatorDraftReducer(draft, { type: 'value', key: 'estimatedMarketValue', value: 50 })
    const loaded = calculatorDraftReducer(draft, { type: 'loaded', saved: null })
    expect(loaded.inputs.estimatedMarketValue.value).toBe(50)
    expect(loaded.inputs.acquisitionCost.value).toBe(10)
    expect(canSaveCalculatorDraft(loaded)).toBe(true)
  })

  it('retains saved provenance for untouched sources and removes an obsolete reference when the source changes', () => {
    const savedInputs = inputs(35)
    savedInputs.acquisitionCost.provenance = { kind: 'listing_observation', reference: 'observation-1' }
    const loaded = calculatorDraftReducer(createCalculatorDraft(inputs(10), 'USD', true), { type: 'loaded', saved: { inputs: savedInputs, currency: 'EUR' } })
    expect(loaded.inputs.acquisitionCost.provenance.reference).toBe('observation-1')
    const edited = calculatorDraftReducer(loaded, { type: 'source', key: 'acquisitionCost', kind: 'operator_override' })
    expect(edited.inputs.acquisitionCost.provenance).toEqual({ kind: 'operator_override' })
    expect(savedInputs.acquisitionCost.provenance.reference).toBe('observation-1')
  })

  it('initializes another listing independently and permits standalone calculation without a read', () => {
    const first = calculatorDraftReducer(createCalculatorDraft(inputs(10), 'USD', true), { type: 'value', key: 'acquisitionCost', value: 99 })
    const second = createCalculatorDraft(inputs(20), 'EUR', true)
    expect(first.inputs.acquisitionCost.value).toBe(99)
    expect(second.inputs.acquisitionCost.value).toBe(20)
    expect(second.editedValues.size).toBe(0)
    expect(canSaveCalculatorDraft(second)).toBe(false)
    expect(canSaveCalculatorDraft(createCalculatorDraft(inputs(20), 'EUR', false))).toBe(true)
  })
})
