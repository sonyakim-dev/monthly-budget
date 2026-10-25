import Link from 'next/link'
import { PayslipList } from '@/components/plan/payslip-list'
import { loadSavedPayslips } from '@/lib/db/payslips'
import { createClient } from '@/lib/supabase/server'

export default async function PayslipsPage() {
  const payslips = await loadSavedPayslips(await createClient())
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <p className="flex items-center gap-2 text-xs text-[#8a8a85]">
        <Link href="/plan" className="hover:underline">
          Plan
        </Link>
        <span aria-hidden>›</span>
        <span>Payslips</span>
      </p>
      <div className="flex items-center gap-2">
        <Link href="/plan" aria-label="Back to Plan" className="-ml-1 flex size-8 items-center justify-center rounded-full text-2xl leading-none text-[#5b5b57] hover:bg-[#f1f1ec] hover:text-[#1c1c1a]">
          ‹
        </Link>
        <h1 className="text-[26px] font-extrabold">Payslips</h1>
      </div>
      {payslips.length ? (
        <PayslipList payslips={payslips} />
      ) : (
        <p className="rounded-2xl border border-dashed border-[#e3e3de] bg-white px-4 py-6 text-center text-sm text-[#8a8a85]">No payslips saved yet. Upload them on Plan.</p>
      )}
    </div>
  )
}
