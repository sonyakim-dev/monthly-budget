import { YearSummary } from '@/components/summary/year-summary'
import { monthRange } from '@/lib/budget/range'
import { buildYear } from '@/lib/budget/year'
import { loadBudgetData } from '@/lib/db/budget'
import { earliestDataMonth } from '@/lib/db/range'
import { getTimeZone } from '@/lib/db/settings'
import { addDays, monthKeyOf, monthStart, addMonths, todayInTimeZone } from '@/lib/domain/dates'
import { createClient } from '@/lib/supabase/server'

export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams
  const supabase = await createClient()
  const today = todayInTimeZone(await getTimeZone(supabase))
  const current = monthKeyOf(today)
  const earliest = await earliestDataMonth(supabase)
  const range = monthRange(earliest, current)

  // The same years you can browse on Home.
  const minYear = Number(range.min.slice(0, 4))
  const maxYear = Number(range.max.slice(0, 4))
  const wanted = Number(yearParam)
  const year = Number.isInteger(wanted) ? Math.min(maxYear, Math.max(minYear, wanted)) : Number(current.slice(0, 4))

  // Load a little beyond the year so income near its edges can be matched, as Home does.
  const data = earliest ? await loadBudgetData(supabase, addDays(monthStart(`${year}-01`), -7), addDays(monthStart(addMonths(`${year}-12`, 1)), 7)) : null

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h1 className="text-[26px] font-extrabold">Summary</h1>
      {data ? (
        <YearSummary view={buildYear(data, year, today, range)} />
      ) : (
        <p className="rounded-2xl border border-dashed border-[#e3e3de] bg-white px-4 py-6 text-center text-sm text-[#8a8a85]">
          Nothing to show yet. Add income, bills or expenses on Home and this fills in month by month.
        </p>
      )}
    </div>
  )
}
