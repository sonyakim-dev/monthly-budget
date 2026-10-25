/** Integer number of cents. All money arithmetic in the app uses cents. */
export type Cents = number

// Digits with optional correct thousands separators, then up to 2 decimals.
// Also accepts what phone users type: ".50" and a trailing "12.".
const AMOUNT_RE = /^(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?|\.\d{1,2})$/
// numeric(12,2) holds at most 9,999,999,999.99
const MAX_CENTS = 999_999_999_999

/**
 * Parses an amount typed by a person: "12", "1,234.5", "$12.30".
 * Returns null for anything else, including zero and negatives.
 */
export function parseAmountInput(input: string): Cents | null {
  const s = input.trim().replace(/^\$/, '')
  if (!AMOUNT_RE.test(s)) return null
  const [whole, frac = ''] = s.replace(/,/g, '').split('.')
  if (whole.length > 10) return null
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return cents > 0 && cents <= MAX_CENTS ? cents : null
}

/**
 * Keeps only what can make an amount as it is typed or pasted: digits and one decimal point,
 * up to 10 digits before the point and 2 after. "$1,200.50" becomes "1200.50"; letters are dropped.
 */
export function cleanAmountInput(input: string): string {
  const [whole, ...rest] = input.replace(/[^\d.]/g, '').split('.')
  const kept = whole.slice(0, 10)
  return rest.length ? `${kept}.${rest.join('').slice(0, 2)}` : kept
}

/** Converts a numeric value from the database (number or string) to cents. */
export function toCents(value: number | string): Cents {
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) throw new Error(`Not a number: ${value}`)
  return Math.round(n * 100)
}

/** Cents → "1234.56", e.g. for pre-filling an amount field. */
export function centsToDecimal(cents: Cents): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function formatMoney(cents: Cents, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

/** Whole dollars ("$1,165") for headline numbers. */
export function formatWholeMoney(cents: Cents, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(
    Math.round(cents / 100),
  )
}
