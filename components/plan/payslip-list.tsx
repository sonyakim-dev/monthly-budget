import { formatDate } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import { cn } from '@/lib/utils'

/** A saved payslip: shown in the lists, and used to spot a duplicate (same employer, check date and net). */
export type SavedPayslipRef = { id: string; employer: string; checkDate: string; netCents: number; payType: string; reconciled: boolean; lineCount: number }

/** Saved payslips, newest first. */
export function PayslipList({ payslips }: { payslips: SavedPayslipRef[] }) {
  return (
    <ul data-testid="saved-payslips" className="divide-y divide-[#f1f1ec] rounded-xl border border-[#ecece7] bg-white">
      {payslips.map((p) => (
        <li key={p.id} className="flex items-center justify-between px-3 py-2 text-[13px]">
          <span>
            {formatDate(p.checkDate)}
            <span className={cn('ml-2 rounded-md px-1.5 py-px text-[10px] font-bold tracking-wider', p.reconciled ? 'bg-[#e7f3ea] text-[#2f7d4f]' : 'bg-[#f7eddb] text-[#b7791f]')}>
              {p.reconciled ? 'RECONCILED' : '⚠ CHECK'}
            </span>
            <span className="block text-[11px] text-[#8a8a85]">
              {p.employer} · {p.payType} · {p.lineCount} lines
            </span>
          </span>
          <span className="tabular-nums">Net {formatMoney(p.netCents)}</span>
        </li>
      ))}
    </ul>
  )
}
