import { addMonths, type MonthKey } from '@/lib/domain/dates'

/** How far ahead you can browse: the same horizon recurring plans are shown for. */
export const MONTHS_AHEAD = 12

export type MonthRange = { min: MonthKey; max: MonthKey }

/** Months you can move between: from the first month with any data to 12 months ahead. */
export function monthRange(earliestData: MonthKey | null, current: MonthKey): MonthRange {
  const min = earliestData && earliestData < current ? earliestData : current
  return { min, max: addMonths(current, MONTHS_AHEAD) }
}

export function clampMonth(month: MonthKey, range: MonthRange): MonthKey {
  if (month < range.min) return range.min
  if (month > range.max) return range.max
  return month
}
