export interface OpportunityInputs {
  acquisition: number
  resale: number
  feePercent: number
  shipping: number
  otherCosts: number
}

export function calculateOpportunity(input: OpportunityInputs) {
  if (Object.values(input).some((value) => !Number.isFinite(value) || value < 0) || input.feePercent > 100) return null
  const amounts = [input.acquisition, input.resale, input.shipping, input.otherCosts]
  if (amounts.some((value) => value > 999_999_999_999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001)) return null
  const acquisition = Math.round(input.acquisition * 100)
  const resale = Math.round(input.resale * 100)
  const fees = Math.round(resale * input.feePercent / 100)
  const totalCost = acquisition + fees + Math.round(input.shipping * 100) + Math.round(input.otherCosts * 100)
  const profit = resale - totalCost
  return { fees: fees / 100, totalCost: totalCost / 100, profit: profit / 100, roiPercent: acquisition > 0 ? profit / acquisition * 100 : null }
}
