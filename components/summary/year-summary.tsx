import Link from 'next/link'
import { COLORS } from '@/components/home/month-view'
import type { YearView } from '@/lib/budget/year'
import { formatMonthShort } from '@/lib/domain/dates'
import { formatWholeMoney } from '@/lib/domain/money'
import { cn } from '@/lib/utils'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const shortMonth = (key: string) => formatMonthShort(key).split(' ')[0] // "Jan"

function YearPill({ year, side }: { year: number | null; side: 'prev' | 'next' }) {
  const text = side === 'prev' ? `‹ ${year ?? ''}` : `${year ?? ''} ›`
  const cls = 'rounded-full border border-[#e3e3de] bg-white px-3 py-1 text-xs'
  return year ? (
    <Link href={`/summary?year=${year}`} className={`${cls} text-[#5b5b57] hover:bg-[#f6f6f2]`}>
      {text}
    </Link>
  ) : (
    <span aria-hidden className={`${cls} invisible`}>
      {side === 'prev' ? '‹ 0000' : '0000 ›'}
    </span>
  )
}

/** One year of Safe to spend: ‹ year ›, the year's total, and a calendar sheet with a cell per month. */
export function YearSummary({ view }: { view: YearView }) {
  const negative = view.totalCents < 0
  const totals = [
    { label: 'Income', cents: view.income, color: COLORS.income },
    { label: 'Bills', cents: view.bills, color: COLORS.bills },
    { label: 'Savings', cents: view.savings, color: COLORS.savings },
    { label: 'Expense', cents: view.expense, color: COLORS.expense },
  ]
  const span = view.monthsWithData
  const soFar = view.months.filter((m) => m.status === 'past')
  const estimated = view.months.filter((m) => m.status === 'now' || m.status === 'estimated')
  const part = (ms: typeof view.months) => (ms.length ? `${shortMonth(ms[0].month)}–${shortMonth(ms[ms.length - 1].month)}` : '')
  const breakdown =
    soFar.length && estimated.length
      ? `${part(soFar)} so far ${formatWholeMoney(view.soFarCents)} · ${part(estimated)} estimated ${formatWholeMoney(view.estimatedCents)}`
      : span
        ? `${part(soFar.length ? soFar : estimated)} · ${soFar.length + estimated.length} ${soFar.length + estimated.length === 1 ? 'month' : 'months'}${estimated.length ? ', estimated' : ' with data'}`
        : ''

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <YearPill year={view.prevYear} side="prev" />
        <span data-testid="year" className="text-xl font-extrabold">
          {view.year}
        </span>
        <YearPill year={view.nextYear} side="next" />
      </div>

      <div className="md:grid md:grid-cols-[260px_1fr] md:items-start md:gap-4">
        <div className="mb-3 rounded-2xl border border-[#ecece7] bg-white px-4 py-3 md:mb-0">
          <p className="text-xs text-[#5b5b57]">Safe to spend · {view.year}</p>
          <p data-testid="year-total" className={cn('text-[30px] font-extrabold leading-tight tracking-tight tabular-nums', negative && 'text-[#c0392b]')}>
            {formatWholeMoney(view.totalCents)}
          </p>
          {breakdown && <p className="mt-0.5 text-[11px] text-[#8a8a85]">{breakdown}</p>}
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-[#8a8a85] md:flex-col">
            {totals.map((t) => (
              <div key={t.label}>
                <dt>
                  <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full" style={{ background: t.color }} />
                  {t.label}
                </dt>
                <dd className="text-[13px] font-bold tabular-nums text-[#1c1c1a]">{formatWholeMoney(t.cents)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <div className="grid grid-cols-3 rounded-2xl border border-[#ecece7] bg-white p-1 md:grid-cols-4">
            {view.months.map((m, i) => {
              const none = m.status === 'none'
              const neg = m.safeToSpendCents < 0
              const inner = (
                <>
                  <p className={cn('text-[11px] font-bold tracking-wider text-[#8a8a85]', m.status === 'now' && 'text-[#1c1c1a]')}>
                    {MONTHS[i]}
                    {m.status === 'now' && ' · NOW'}
                    {m.status === 'estimated' && <span className="text-[#a5a59f]"> · EST</span>}
                  </p>
                  <p className={cn('mt-1 text-base font-extrabold tabular-nums md:text-lg', none && 'font-semibold text-[#cfcfc9]', !none && neg && 'text-[#c0392b]', m.status === 'estimated' && 'font-semibold text-[#5b5b57]')}>
                    {none ? '—' : formatWholeMoney(m.safeToSpendCents)}
                  </p>
                  {!none && (
                    <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-[#ededе8]">
                      <div className={cn('h-full rounded-full', neg ? 'bg-[#c0392b]' : 'bg-[#2f7d4f]')} style={{ width: `${Math.round(Math.abs(m.bar) * 100)}%` }} />
                    </div>
                  )}
                </>
              )
              const cls = cn('block min-h-[66px] rounded-xl px-3 py-2.5 md:min-h-20', m.status === 'now' && 'bg-[#f6f6f2]')
              return none ? (
                <div key={m.month} data-testid={`month-${m.month}`} className={cls}>
                  {inner}
                </div>
              ) : (
                <Link key={m.month} href={`/?month=${m.month}`} data-testid={`month-${m.month}`} aria-label={`Open ${formatMonthShort(m.month)}`} className={`${cls} hover:bg-[#fbfbf9]`}>
                  {inner}
                </Link>
              )
            })}
          </div>
          <p className="mt-2 px-0.5 text-[11px] text-[#8a8a85]">Tap a month to open it on Home.</p>
        </div>
      </div>
    </div>
  )
}
