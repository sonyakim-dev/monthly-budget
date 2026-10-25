import Link from 'next/link'
import { PayslipList } from '@/components/plan/payslip-list'
import { PayslipUpload } from '@/components/plan/payslip-upload'
import { loadJobs } from '@/lib/db/budget'
import { loadSavedPayslips } from '@/lib/db/payslips'
import { createClient } from '@/lib/supabase/server'

const SHOWN = 3

export default async function PlanPage() {
  const supabase = await createClient()
  const [saved, jobs] = await Promise.all([loadSavedPayslips(supabase), loadJobs(supabase)])

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h1 className="text-[26px] font-extrabold">Plan</h1>
      <section className="space-y-3 rounded-2xl border border-[#ecece7] bg-white p-3">
        <h2 className="flex items-center justify-between px-1 text-sm font-semibold text-[#3f3f3b]">
          Payslips
          <span className="text-xs font-normal text-[#a5a59f]">{saved.length} saved · desktop upload</span>
        </h2>
        <PayslipUpload saved={saved} jobs={jobs} />
        {saved.length > 0 && <PayslipList payslips={saved.slice(0, SHOWN)} />}
        {saved.length > SHOWN && (
          <Link href="/plan/payslips" className="block px-1 text-[13px] font-semibold text-[#3f3f3b] hover:underline">
            View all {saved.length}
          </Link>
        )}
      </section>
      <p className="px-1 text-xs text-[#8a8a85]">Jobs and Settings come in a later step.</p>
    </div>
  )
}
