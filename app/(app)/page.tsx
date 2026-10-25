import Link from 'next/link'
import { EntrySheetProvider, type SheetEntry } from '@/components/home/entry-sheet'
import { MonthPicker } from '@/components/home/month-picker'
import { PlanSheetProvider } from '@/components/home/plan-sheet'
import { ExpenseCard, MonthCards, SafeToSpend } from '@/components/home/month-view'
import { SideMonth } from '@/components/home/side-month'
import { SwipeArea } from '@/components/home/swipe-area'
import { billDetails, groupDetails, incomeDetails, savingsDetails } from '@/lib/budget/bill-details'
import { buildMonth } from '@/lib/budget/month'
import { clampMonth, monthRange } from '@/lib/budget/range'
import { loadBudgetData } from '@/lib/db/budget'
import { earliestDataMonth } from '@/lib/db/range'
import { getTimeZone } from '@/lib/db/settings'
import { addDays, addMonths, formatMonthShort, monthKeyOf, monthStart, parseMonthKey, todayInTimeZone } from '@/lib/domain/dates'
import { createClient } from '@/lib/supabase/server'

// Wide laptop screens (≥1400px) show the neighbouring months beside the selected one,
// with round ‹ › buttons in the gaps instead of the header pills.
const pillBase = 'rounded-full border border-[#e3e3de] bg-white px-3 py-1 text-xs min-[1400px]:hidden'
const pill = `${pillBase} text-[#5b5b57] hover:bg-[#f6f6f2]`
const pillDisabled = `${pillBase} cursor-not-allowed text-[#c9c9c4]`

// Each month column on wide screens is a subgrid over the same four rows
// (name · summary · cards · expense), so neighbouring months line up with the current one.
const COLUMN = 'min-[1400px]:row-span-4 min-[1400px]:grid min-[1400px]:grid-rows-subgrid min-[1400px]:gap-y-4'

/**
 * Big round ‹ › in the gap between months. It may overlap the faded side month, never the current one.
 * Fixed to the middle of the screen (keeping its place in the gap sideways), so it doesn't move between months.
 */
function GapArrow({ href, label, glyph, side }: { href: string | null; label: string; glyph: string; side: 'prev' | 'next' }) {
  const circle = `fixed top-[calc(50dvh-32px)] z-10 flex size-16 items-center justify-center rounded-full border border-[#e3e3de] bg-white pb-1 text-4xl shadow-md ${side === 'prev' ? '-ml-5' : '-mr-5'}`
  return (
    <div className={`hidden min-[1400px]:row-span-4 min-[1400px]:flex min-[1400px]:flex-col min-[1400px]:justify-center ${side === 'prev' ? 'min-[1400px]:items-start' : 'min-[1400px]:items-end'}`}>
      {href ? (
        <Link href={href} aria-label={label} className={`${circle} text-[#3f3f3b] hover:bg-[#f6f6f2]`}>
          {glyph}
        </Link>
      ) : (
        <button type="button" disabled aria-label={label} className={`${circle} cursor-not-allowed text-[#d6d6d1] shadow-none`}>
          {glyph}
        </button>
      )}
    </div>
  )
}

function Pill({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} aria-label={label} className={pill}>
      {children}
    </Link>
  ) : (
    <button type="button" disabled aria-label={label} className={pillDisabled}>
      {children}
    </button>
  )
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await searchParams
  const supabase = await createClient()
  const today = todayInTimeZone(await getTimeZone(supabase))
  const current = monthKeyOf(today)

  // You can browse from the first month with data to 12 months ahead.
  const range = monthRange(await earliestDataMonth(supabase), current)
  const month = clampMonth(parseMonthKey(monthParam) ?? current, range)
  const prev = addMonths(month, -1)
  const next = addMonths(month, 1)
  const prevHref = prev >= range.min ? `/?month=${prev}` : null
  const nextHref = next <= range.max ? `/?month=${next}` : null

  // Load a little beyond the neighbouring months so income near month edges can be matched.
  const data = await loadBudgetData(supabase, addDays(monthStart(prev), -7), addDays(monthStart(addMonths(month, 2)), 7))
  const view = buildMonth(data, month, today)
  const label = formatMonthShort(month)

  // Actual entries in this month open in the edit sheet; payslip entries are read-only.
  const monthEntries: SheetEntry[] = data.transactions
    .filter((t) => t.date.startsWith(month))
    .map((t) => ({ id: t.id, kind: t.kind, amountCents: t.amountCents, name: t.name, date: t.date, categoryId: t.categoryId, locked: t.source === 'payslip' }))
  const defaultDate = month === current ? today : `${month}-01`

  // An empty slot keeps the columns in place when a neighbouring month is out of range.
  const side = (key: string, href: string | null) =>
    href ? (
      <SideMonth view={buildMonth(data, key, today)} label={formatMonthShort(key)} className={`hidden ${COLUMN}`} />
    ) : (
      <div className={`hidden ${COLUMN}`} />
    )

  return (
    <SwipeArea month={month} min={range.min} max={range.max}>
      <div className="min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1fr)_56px_minmax(0,2.6fr)_56px_minmax(0,1fr)] min-[1400px]:grid-rows-[repeat(4,auto)]">
        {side(prev, prevHref)}
        <GapArrow href={prevHref} label="Previous month" glyph="‹" side="prev" />

        <div data-testid="current-month" className={`space-y-4 min-[1400px]:space-y-0 ${COLUMN}`}>
          <header className="space-y-1">
            <div className="flex items-center justify-between min-[1400px]:justify-center">
              <Pill href={prevHref} label="Previous month">
                ‹ {formatMonthShort(prev).split(' ')[0]}
              </Pill>
              <div className="flex items-center gap-2">
                <h1 className="hidden text-[32px] font-extrabold tracking-tight md:block">{label}</h1>
                <MonthPicker month={month} today={today} min={range.min} max={range.max} />
              </div>
              <Pill href={nextHref} label="Next month">
                {formatMonthShort(next).split(' ')[0]} ›
              </Pill>
            </div>
            <h1 className="text-center text-[40px] font-extrabold leading-tight tracking-tight md:hidden">{label}</h1>
            {/* One line, the same height in every month: days left now, or a way back to now. */}
            <p className="h-4 text-center text-xs leading-4 text-[#8a8a85]">
              {month === current ? (
                view.daysLeft !== null && `${view.daysLeft} ${view.daysLeft === 1 ? 'day' : 'days'} left`
              ) : (
                <Link href="/" className="inline-flex items-center gap-1 hover:text-[#3f3f3b]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden>
                    <path d="M9 14 4 9l5-5" />
                    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                  </svg>
                  <span className="underline underline-offset-2">Back To Today&apos;s Month</span>
                </Link>
              )}
            </p>
          </header>
          <SafeToSpend view={view} />
          <EntrySheetProvider entries={monthEntries} categories={data.categories} defaultDate={defaultDate}>
            <PlanSheetProvider bills={billDetails(data, month)} groups={groupDetails(data, view.bills.groups)} savings={savingsDetails(data, month)} incomes={incomeDetails(data, month)}
              incomeCategories={data.categories.filter((c) => c.kind === 'income').sort((a, b) => a.sort - b.sort)}
              defaultDate={defaultDate}
              month={month}
            >
              <MonthCards view={view} jobs={data.jobs} />
            </PlanSheetProvider>
            <ExpenseCard view={view} />
          </EntrySheetProvider>
        </div>

        <GapArrow href={nextHref} label="Next month" glyph="›" side="next" />
        {side(next, nextHref)}
      </div>
    </SwipeArea>
  )
}
