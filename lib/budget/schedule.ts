import { addDays } from '@/lib/domain/dates'

export type Frequency = 'once' | 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export type Schedule = { frequency: Frequency; start: string; end: string | null }

const STEP_DAYS: Partial<Record<Frequency, number>> = { weekly: 7, biweekly: 14 }

const ymd = (iso: string) => iso.split('-').map(Number) as [number, number, number]
const daysBetween = (a: string, b: string) => {
  const [ay, am, ad] = ymd(a)
  const [by, bm, bd] = ymd(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Every date the schedule hits within [from, to], inclusive, never before its start or after its end. */
export function occurrences(schedule: Schedule, from: string, to: string): string[] {
  const lower = schedule.start > from ? schedule.start : from
  const upper = schedule.end && schedule.end < to ? schedule.end : to
  if (lower > upper) return []

  if (schedule.frequency === 'once') return schedule.start >= from && schedule.start <= upper ? [schedule.start] : []

  const step = STEP_DAYS[schedule.frequency]
  if (step) {
    const skip = Math.max(0, Math.ceil(daysBetween(schedule.start, lower) / step))
    const dates: string[] = []
    for (let d = addDays(schedule.start, skip * step); d <= upper; d = addDays(d, step)) dates.push(d)
    return dates
  }

  const dates: string[] = []
  const [, , startDay] = ymd(schedule.start)
  let [y, m] = ymd(lower)
  const [uy, um] = ymd(upper)
  while (y < uy || (y === uy && m <= um)) {
    const last = lastDayOfMonth(y, m)
    const days = schedule.frequency === 'semimonthly' ? [15, last] : [Math.min(startDay, last)]
    for (const day of days) {
      const date = iso(y, m, day)
      if (date >= lower && date <= upper) dates.push(date)
    }
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return dates
}

/** The value of the latest version starting on or before `at` (both "YYYY-MM" or both "YYYY-MM-DD"). */
export function versionAt<T>(versions: { from: string; value: T }[], at: string): T | null {
  let best: { from: string; value: T } | null = null
  for (const v of versions) if (v.from <= at && (!best || v.from > best.from)) best = v
  return best ? best.value : null
}
