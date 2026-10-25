import Link from 'next/link'
import type { MonthView } from '@/lib/budget/month'
import { formatWholeMoney } from '@/lib/domain/money'
import { cn } from '@/lib/utils'
import { COLORS } from './month-view'

const box = 'rounded-xl border border-[#ecece7] bg-white'
const line = 'flex justify-between gap-2 border-t border-[#f1f1ec] px-3 py-1 text-[11px]'

function Head({ title, color, cents }: { title: string; color: string; cents: number }) {
  return (
    <div className="flex justify-between px-3 py-2 text-xs font-semibold text-[#3f3f3b]">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />
        {title}
      </span>
      <span className="tabular-nums">{formatWholeMoney(cents)}</span>
    </div>
  )
}

/**
 * A faded, read-only preview of a neighbouring month (wide laptop screens). Its four parts —
 * name, summary, cards, expense — sit in the page's shared rows so they line up with the
 * current month. Clicking anywhere opens that month.
 */
export function SideMonth({ view, label, className }: { view: MonthView; label: string; className?: string }) {
  const negative = view.safeToSpendCents < 0
  return (
    <Link
      href={`/?month=${view.month}`}
      data-testid={`side-month-${view.month}`}
      aria-label={`Open ${label}`}
      className={cn('opacity-45 saturate-[.7] transition-opacity hover:opacity-70', className)}
    >
      <p className="self-end text-center text-[22px] font-extrabold tracking-tight">{label}</p>

      <div data-testid={`side-summary-${view.month}`} className={cn(box, 'flex flex-col justify-center px-3 py-2')}>
        <p className="text-[11px] text-[#8a8a85]">Safe to spend</p>
        <p data-testid={`side-safe-${view.month}`} className={cn('text-xl font-bold tabular-nums', negative && 'text-[#c0392b]')}>
          {formatWholeMoney(view.safeToSpendCents)}
        </p>
      </div>

      <div data-testid={`side-cards-${view.month}`} className="space-y-3 self-start">
        <div className={box}>
          <Head title="Income" color={COLORS.income} cents={view.income.totalCents} />
          {view.income.lines.slice(0, 4).map((l, i) => (
            <div key={l.id ?? i} className={line}>
              <span className="truncate">{l.name}</span>
              <span className="tabular-nums">{formatWholeMoney(l.cents)}</span>
            </div>
          ))}
        </div>
        <div className={box}>
          <Head title="Savings" color={COLORS.savings} cents={view.savings.totalCents} />
        </div>
        <div className={box}>
          <Head title="Bills" color={COLORS.bills} cents={view.bills.totalCents} />
          {view.bills.groups.map((g) => (
            <div key={g.id} className={cn(line, 'font-bold tracking-wider')} style={{ background: `${g.color}55` }}>
              <span>{g.name.toUpperCase()}</span>
              <span className="tabular-nums">{formatWholeMoney(g.totalCents)}</span>
            </div>
          ))}
        </div>
      </div>

      <div data-testid={`side-expense-${view.month}`} className={cn(box, 'self-start')}>
        <Head title="Expense" color={COLORS.expense} cents={view.expense.totalCents} />
        {view.expense.categories.slice(0, 3).map((c) => (
          <div key={c.categoryId} className={line}>
            <span className="truncate">{c.name}</span>
            <span className="tabular-nums">{formatWholeMoney(c.cents)}</span>
          </div>
        ))}
      </div>
    </Link>
  )
}
