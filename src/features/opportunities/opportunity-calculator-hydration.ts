import type { OpportunityInputsWithProvenance } from './opportunity.schemas'

type InputKey = keyof OpportunityInputsWithProvenance
const inputKeys = ['quantity', 'acquisitionCost', 'estimatedMarketValue', 'platformFeePercent', 'paymentFeePercent', 'shipping', 'tax', 'handling', 'otherCosts', 'downsidePercent'] as const

type Draft = {
  inputs: OpportunityInputsWithProvenance
  currency: string | null
  editedValues: Set<InputKey>
  editedSources: Set<InputKey>
  editedCurrency: boolean
  loadStatus: 'loading' | 'ready' | 'error'
}

export function createCalculatorDraft(inputs: OpportunityInputsWithProvenance, currency: string | null, needsLoad: boolean): Draft {
  return {
    inputs,
    currency,
    editedValues: new Set<InputKey>(),
    editedSources: new Set<InputKey>(),
    editedCurrency: false,
    loadStatus: needsLoad ? 'loading' : 'ready',
  }
}

type Action =
  | { type: 'value'; key: InputKey; value: number | null }
  | { type: 'source'; key: InputKey; kind: OpportunityInputsWithProvenance[InputKey]['provenance']['kind'] }
  | { type: 'currency'; currency: string | null }
  | { type: 'load-start' }
  | { type: 'load-error' }
  | { type: 'loaded'; saved: { inputs: OpportunityInputsWithProvenance; currency: string | null } | null }

/** Hydrate untouched fields while retaining edits made during the read or a retry. */
export function calculatorDraftReducer(state: Draft, action: Action): Draft {
  switch (action.type) {
    case 'value':
      return { ...state, inputs: { ...state.inputs, [action.key]: { ...state.inputs[action.key], value: action.value } }, editedValues: new Set([...state.editedValues, action.key]) }
    case 'source':
      return { ...state, inputs: { ...state.inputs, [action.key]: { ...state.inputs[action.key], provenance: { kind: action.kind } } }, editedSources: new Set([...state.editedSources, action.key]) }
    case 'currency':
      return { ...state, currency: action.currency, editedCurrency: true }
    case 'load-start':
      return { ...state, loadStatus: 'loading' }
    case 'load-error':
      return { ...state, loadStatus: 'error' }
    case 'loaded': {
      if (!action.saved) return { ...state, loadStatus: 'ready' }
      const inputs = { ...state.inputs }
      for (const key of inputKeys) {
        inputs[key] = {
          value: state.editedValues.has(key) ? state.inputs[key].value : action.saved.inputs[key].value,
          provenance: state.editedSources.has(key) ? state.inputs[key].provenance : action.saved.inputs[key].provenance,
        }
      }
      return { ...state, inputs, currency: state.editedCurrency ? state.currency : action.saved.currency, loadStatus: 'ready' }
    }
  }
}

export function canSaveCalculatorDraft(state: Draft) {
  return state.loadStatus === 'ready'
}
