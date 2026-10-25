export const DEFAULT_TIME_ZONE = 'America/Los_Angeles'

/** "YYYY-MM" */
export type MonthKey = string

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Years 1900–2999: outside that, Postgres or Date.UTC (which maps 0–99 to 19xx) misbehave.
const MONTH_KEY_RE = /^(19|2\d)\d{2}-(0[1-9]|1[0-2])$/

/** Today's date ("YYYY-MM-DD") as seen in the given IANA time zone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function parseMonthKey(value: string | null | undefined): MonthKey | null {
  return value && MONTH_KEY_RE.test(value) ? value : null
}

export function monthKeyOf(isoDate: string): MonthKey {
  return isoDate.slice(0, 7)
}

export function monthStart(key: MonthKey): string {
  return `${key}-01`
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const [y, m] = key.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const year = Math.floor(total / 12)
  const month = total - year * 12 + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function formatMonthLabel(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )
}

/** "Sep 2026" — for compact month cards. */
/** "Mar 2, 2026" */
export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`))
}

export function formatMonthShort(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )
}
