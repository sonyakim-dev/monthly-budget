import type { MonthView as MonthData } from '@/lib/budget/month'
import type { Job } from '@/lib/budget/paycheck'
import { formatMoney, formatWholeMoney } from '@/lib/domain/money'
import { cn } from '@/lib/utils'
import { CollapsibleCard } from './collapsible-card'
import { AddExpenseButton, EntryButton } from './entry-sheet'
import { ExpenseCategory } from './expense-category'
import { AddBillButton, AddIncomeButton, AddSavingButton, BillButton, GroupButton, IncomeButton, NoteButton, PaycheckButton, SavingsButton } from './plan-sheet'

/** What each card counts, shown by its ⓘ. */
const INFO = {
  income: 'Take-home pay only: what reaches your account after taxes and deductions.',
  savings: 'Money you set aside, plus 401(k) and HSA from your paycheck.',
  bills: 'Payments that repeat, like rent or subscriptions. One-off spending goes in Expense.',
  expense: "Everyday spending that isn't a bill.",
}

const PAYCHECK_NOTE = "Estimated from your job's pay. Change pay in Plan › Jobs. The real amount replaces this when you add the payslip."
const PAYCHECK_SAVING_NOTE = 'This comes from your paycheck. Change your contribution in Plan › Jobs, and actual amounts come from payslips.'

export const COLORS = { income: '#2f7d4f', savings: '#3a6ea5', bills: '#b7791f', expense: '#b4443c' } as const

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

function Row({ left, right, muted }: { left: React.ReactNode; right: React.ReactNode; muted?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3 border-t border-[#f1f1ec] px-4 py-2 text-[13px] first:border-t-0', muted && 'text-[#8a8a85]')}>
      <span className="min-w-0">{left}</span>
      <span className="shrink-0 tabular-nums">{right}</span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3 text-[13px] text-[#8a8a85]">{children}</p>
}

export function SafeToSpend({ view }: { view: MonthData }) {
  const negative = view.safeToSpendCents < 0
  const perDay = view.perDay
  const totals = [
    { label: 'Income', cents: view.income.totalCents, color: COLORS.income },
    { label: 'Savings', cents: view.savings.totalCents, color: COLORS.savings },
    { label: 'Bills', cents: view.bills.totalCents, color: COLORS.bills },
    { label: 'Expense', cents: view.expense.totalCents, color: COLORS.expense },
  ]
  return (
    <div className="text-center md:flex md:items-center md:gap-8 md:rounded-2xl md:border md:border-[#ecece7] md:bg-white md:px-5 md:py-4 md:text-left">
      {/* Always the height of label, amount and one line below, so the cards below stay put when switching months.
          With nothing to say below, the label and amount sit in the middle of that space. */}
      <div className="flex min-h-[5.375rem] flex-col justify-center">
        <p className="text-sm text-[#5b5b57]">Safe to spend</p>
        <p
          data-testid="safe-to-spend"
          data-negative={negative}
          className={cn('text-[40px] font-bold leading-tight tracking-tight tabular-nums', negative && 'text-[#c0392b]')}
        >
          {formatWholeMoney(view.safeToSpendCents)}
        </p>
        {(negative || perDay) && (
          <p className={cn('text-xs leading-4', negative ? 'text-[#c0392b]' : 'text-[#2f7d4f]')}>
            {negative && `Over by ${formatWholeMoney(-view.safeToSpendCents)}`}
            {perDay && (
              <>
                {negative && ' · '}≈ {formatWholeMoney(perDay.cents)} a day {perDay.until === 'payday' ? 'until payday' : 'for the rest of the month'}
              </>
            )}
          </p>
        )}
      </div>
      <dl className="ml-auto hidden gap-7 text-right md:flex">
        {totals.map((t) => (
          <div key={t.label}>
            <dt className="text-xs text-[#8a8a85]">
              <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full" style={{ background: t.color }} />
              {t.label}
            </dt>
            <dd className="text-lg font-bold tabular-nums">{formatWholeMoney(t.cents)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Income and Savings stacked on the left, Bills on the right (one column on phones). */
export function MonthCards({ view, jobs = [] }: { view: MonthData; jobs?: Job[] }) {
  const k401 = view.savings.k401
  return (
    <div className="grid gap-3 md:grid-cols-2 md:items-start">
      <div className="space-y-3">
        <CollapsibleCard title="Income" info={INFO.income} dot={COLORS.income} total={formatWholeMoney(view.income.totalCents)} totalTestId="income-total">
          <AddIncomeButton />
          {view.income.lines.length === 0 ? (
            <Empty>No income this month.</Empty>
          ) : (
            view.income.lines.map((l, i) => {
              const row = (
                <Row
                  muted={l.expected || l.skipped}
                  left={
                    <>
                      {l.skipped && 'Skipped: '}
                      {l.name} <span className="text-[#8a8a85]">· {shortDate(l.date)}</span>
                      {!l.skipped && (l.expected ? ' (expected)' : l.estimated && ' (est)')}
                    </>
                  }
                  right={l.skipped ? <s className="text-[#a5a59f]">{formatMoney(l.cents)}</s> : formatMoney(l.cents)}
                />
              )
              // Recorded entries open the entry sheet, other income opens the income sheet, and paychecks estimated from a job open a note.
              return l.id ? (
                <EntryButton key={l.id} id={l.id}>
                  {row}
                </EntryButton>
              ) : l.source === 'plan' && l.sourceId ? (
                <IncomeButton key={`${l.date}-${l.sourceId}`} id={l.sourceId} date={l.date} skipped={!!l.skipped}>
                  {row}
                </IncomeButton>
              ) : l.source === 'job' && l.sourceId ? (
                <PaycheckButton key={`${l.date}-${l.sourceId}`} jobId={l.sourceId} date={l.date} title={l.name} note={PAYCHECK_NOTE} skipped={!!l.skipped} jobs={jobs}>
                  {row}
                </PaycheckButton>
              ) : (
                <div key={`${l.date}-${l.name}-${i}`}>{row}</div>
              )
            })
          )}
        </CollapsibleCard>

        <CollapsibleCard title="Savings" info={INFO.savings} dot={COLORS.savings} total={formatWholeMoney(view.savings.totalCents)} totalTestId="savings-total">
          <AddSavingButton />
          {view.savings.lines.map((l, i) =>
            // A plan opens the savings sheet; a transfer not tied to a plan opens the entry sheet.
            l.planId ? (
              <SavingsButton key={l.planId} id={l.planId}>
                <Row left={l.name} right={formatMoney(l.cents)} />
              </SavingsButton>
            ) : l.entryIds[0] ? (
              <EntryButton key={l.entryIds[0]} id={l.entryIds[0]}>
                <Row left={l.name} right={formatMoney(l.cents)} />
              </EntryButton>
            ) : (
              <Row key={`transfer-${i}`} left={l.name} right={formatMoney(l.cents)} />
            ),
          )}
          {view.savings.paycheck.lines.length > 0 && (
            <div>
              <div className="flex justify-between border-t border-[#f1f1ec] bg-[#3a6ea51a] px-4 py-1.5 text-[11px] font-bold tracking-wider text-[#2b4f78] first:border-t-0">
                <span>FROM PAYCHECK</span>
                <span className="tabular-nums">{formatMoney(view.savings.paycheck.totalCents)}</span>
              </div>
              {view.savings.paycheck.lines.map((l) => (
                <NoteButton key={l.tag} title={l.label} note={PAYCHECK_SAVING_NOTE}>
                  <Row left={l.label} right={formatMoney(l.cents)} />
                </NoteButton>
              ))}
              <p className="border-t border-[#f1f1ec] px-4 py-1.5 text-[11px] text-[#8a8a85]">Already taken out of pay, so not subtracted from Safe to spend.</p>
            </div>
          )}
          {k401 && (
            <div className="border-t border-[#f1f1ec] px-4 py-2 text-[13px] first:border-t-0">
              <div className="flex justify-between">
                <span>401(k) this year</span>
                <span className="tabular-nums">
                  {formatWholeMoney(k401.ytdCents)}
                  {k401.limitCents !== null && ` / ${formatWholeMoney(k401.limitCents)}`}
                </span>
              </div>
              {k401.limitCents !== null && k401.limitCents > 0 && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e9e9e4]" role="progressbar" aria-label="401(k) progress" aria-valuenow={Math.round((k401.ytdCents / k401.limitCents) * 100)}>
                  <div className="h-full rounded-full bg-[#3a6ea5]" style={{ width: `${Math.min(100, (k401.ytdCents / k401.limitCents) * 100)}%` }} />
                </div>
              )}
            </div>
          )}
          {view.savings.lines.length === 0 && view.savings.paycheck.lines.length === 0 && !k401 && <Empty>No savings planned this month.</Empty>}
        </CollapsibleCard>

      </div>

      <CollapsibleCard title="Bills" info={INFO.bills} dot={COLORS.bills} total={formatWholeMoney(view.bills.totalCents)} totalTestId="bills-total">
        <AddBillButton />
        {view.bills.groups.length === 0 ? (
          <Empty>No bills this month.</Empty>
        ) : (
          view.bills.groups.map((g) => (
            <div key={g.id}>
              <GroupButton id={g.id} name={g.name} className="flex justify-between border-t border-[#f1f1ec] px-4 py-1.5 text-[11px] font-bold tracking-wider text-[#3f3f3b] first:border-t-0" style={{ background: `${g.color}55` }}>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: g.color }} />
                  {g.name.toUpperCase()}
                  <span aria-hidden className="font-normal text-[#8a8a85]">✎</span>
                </span>
                <span className="tabular-nums">{formatMoney(g.totalCents)}</span>
              </GroupButton>
              {g.lines.map((l) => (
                <BillButton key={l.billId} id={l.billId}>
                  <Row left={l.name} right={formatMoney(l.cents)} />
                </BillButton>
              ))}
            </div>
          ))
        )}
      </CollapsibleCard>
    </div>
  )
}

export function ExpenseCard({ view }: { view: MonthData }) {
  return (
    <CollapsibleCard title="Expense" info={INFO.expense} dot={COLORS.expense} total={formatWholeMoney(view.expense.totalCents)} totalTestId="expense-total" className="self-start">
      <AddExpenseButton />
      {view.expense.categories.length === 0 ? (
        <Empty>No expenses this month yet.</Empty>
      ) : (
        <div className="md:grid md:grid-cols-2 md:items-start">
          {view.expense.categories.map((c) => (
            <ExpenseCategory key={c.categoryId} name={c.name} cents={c.cents} entries={c.entries} />
          ))}
        </div>
      )}
    </CollapsibleCard>
  )
}
