import { z } from 'zod'

/** A normalized ISO 4217-style currency code, or absent when the source did not declare one. */
export const currencyCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code.')

export function normalizeCurrency(value: unknown): string | undefined {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return undefined
  return currencyCodeSchema.parse(value)
}

export function formatCurrencyAmount(value: number, currency: string | null | undefined): string {
  if (!currency) return value.toFixed(2)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}
