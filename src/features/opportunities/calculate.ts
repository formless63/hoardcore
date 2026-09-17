export interface OpportunityInputs { quantity: number | null; acquisitionCost: number | null; estimatedMarketValue: number | null; platformFeePercent: number | null; paymentFeePercent: number | null; shipping: number | null; tax: number | null; handling: number | null; otherCosts: number | null; downsidePercent: number | null }
export type MissingOpportunityInput = keyof OpportunityInputs
export type OpportunityCalculation = { status: 'complete'; grossRevenue: number; platformFees: number; paymentFees: number; totalFees: number; totalCost: number; profit: number; roiPercent: number | null; marginPercent: number | null; breakEvenUnitPrice: number | null; downsideRevenue: number; downsideProfit: number } | { status: 'incomplete'; missing: MissingOpportunityInput[] } | { status: 'invalid' }
const monetaryKeys = ['acquisitionCost', 'estimatedMarketValue', 'shipping', 'tax', 'handling', 'otherCosts'] as const
const requiredKeys: readonly MissingOpportunityInput[] = ['quantity', 'acquisitionCost', 'estimatedMarketValue', 'platformFeePercent', 'paymentFeePercent', 'shipping', 'tax', 'handling', 'otherCosts', 'downsidePercent']
function cents(value: number) { return Math.round(value * 100) }
function percentUnits(value: number) { return Math.round(value * 10_000) }
function money(value: number) { return value / 100 }

/** Deterministic, currency-local calculation. No exchange rates or model output enter here. */
export function calculateOpportunity(input: OpportunityInputs): OpportunityCalculation {
  const missing = requiredKeys.filter((key) => input[key] === null)
  if (missing.length) return { status: 'incomplete', missing }
  const values = input as Record<keyof OpportunityInputs, number>
  if (!Number.isInteger(values.quantity) || values.quantity < 1 || values.quantity > 1_000_000 || Object.values(values).some((value) => !Number.isFinite(value) || value < 0) || values.platformFeePercent + values.paymentFeePercent > 100 || monetaryKeys.some((key) => values[key] > 999_999_999_999.99 || Math.abs(values[key] * 100 - cents(values[key])) > 0.0001) || [values.platformFeePercent, values.paymentFeePercent, values.downsidePercent].some((value) => value > 100 || Math.abs(value * 10_000 - percentUnits(value)) > 0.0001)) return { status: 'invalid' }
  const quantity = values.quantity; const gross = cents(values.estimatedMarketValue) * quantity; const acquisition = cents(values.acquisitionCost) * quantity
  // Number arithmetic is exact only through MAX_SAFE_INTEGER. Refuse a scenario
  // before any fee rounding could silently drift at very large quantities.
  if (!Number.isSafeInteger(gross) || !Number.isSafeInteger(acquisition) || !monetaryKeys.every((key) => Number.isSafeInteger(cents(values[key])))) return { status: 'invalid' }
  const platformRate = percentUnits(values.platformFeePercent); const paymentRate = percentUnits(values.paymentFeePercent); const feeRate = platformRate + paymentRate
  const feesFor = (revenue: number) => ({ platform: Math.round(revenue * platformRate / 1_000_000), payment: Math.round(revenue * paymentRate / 1_000_000) })
  const fees = feesFor(gross); const fixedCosts = acquisition + cents(values.shipping) + cents(values.tax) + cents(values.handling) + cents(values.otherCosts); const totalCost = fixedCosts + fees.platform + fees.payment; const profit = gross - totalCost
  if (![fees.platform, fees.payment, fixedCosts, totalCost, profit].every(Number.isSafeInteger)) return { status: 'invalid' }
  const downsideGross = Math.round(gross * (1_000_000 - percentUnits(values.downsidePercent)) / 1_000_000); const downsideFees = feesFor(downsideGross); const downsideProfit = downsideGross - fixedCosts - downsideFees.platform - downsideFees.payment
  let breakEvenUnitPrice: number | null = null
  if (feeRate < 1_000_000) { let grossAtBreakEven = Math.ceil(fixedCosts * 1_000_000 / (1_000_000 - feeRate)); while (grossAtBreakEven - fixedCosts - feesFor(grossAtBreakEven).platform - feesFor(grossAtBreakEven).payment < 0) grossAtBreakEven += 1; breakEvenUnitPrice = money(Math.ceil(grossAtBreakEven / quantity)) }
  return { status: 'complete', grossRevenue: money(gross), platformFees: money(fees.platform), paymentFees: money(fees.payment), totalFees: money(fees.platform + fees.payment), totalCost: money(totalCost), profit: money(profit), roiPercent: totalCost > 0 ? profit / totalCost * 100 : null, marginPercent: gross > 0 ? profit / gross * 100 : null, breakEvenUnitPrice, downsideRevenue: money(downsideGross), downsideProfit: money(downsideProfit) }
}
