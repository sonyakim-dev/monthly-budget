'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { savePayslip } from '@/lib/actions/payslips'
import type { Job } from '@/lib/budget/paycheck'
import { formatDate } from '@/lib/domain/dates'
import type { ParseResult } from '@/lib/payslip/parse'
import { matchJob } from '@/lib/payslip/review'
import { draftFor, Review, reviewInput, type ReviewItem } from '@/components/plan/payslip-review'

const UNREADABLE = {
  'no-text': 'No text in this PDF (a scan?). Upload it on Plan once AI reading is in.',
  'no-parser': "This isn't a layout the app knows yet. Upload it on Plan once AI reading is in.",
  error: "Couldn't read this file. Check your connection and try again.",
}

/**
 * "Upload payslip" for an estimated paycheck on Home (desktop). The PDF is read once by the server; the review
 * opens with this job and payday already set, and saving puts the real figure in place of the estimate.
 */
export function UploadPayslipButton({ job, date, onReview }: { job: Job; date: string; onReview: (item: ReviewItem) => void }) {
  const [reading, setReading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const read = async (file: File) => {
    setReading(true)
    setMessage(null)
    const body = new FormData()
    body.set('file', file)
    try {
      const res = await fetch('/api/payslips/parse', { method: 'POST', body })
      const json = (await res.json()) as ParseResult | { error: string }
      if (!res.ok || !('ok' in json)) setMessage(UNREADABLE.error)
      else if (!json.ok) setMessage(UNREADABLE[json.reason])
      else onReview({ name: file.name, file, result: json, duplicate: false })
    } catch {
      setMessage(UNREADABLE.error)
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="hidden md:block">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#ecece7] px-3 py-2">
        <span className="text-[11px] text-[#8a8a85]">Reads the PDF once; never stores it.</span>
        <label className="cursor-pointer rounded-lg bg-[#1c1c1a] px-3 py-1.5 text-[12px] font-semibold text-white">
          {reading ? 'Reading…' : 'Upload payslip'}
          <input
            type="file"
            accept="application/pdf"
            aria-label={`Upload payslip for ${job.name} on ${formatDate(date)}`}
            className="sr-only"
            disabled={reading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) read(file)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {message && (
        <p role="alert" className="mt-2 text-sm text-[#c0392b]">
          {message}
        </p>
      )}
    </div>
  )
}

/** The review for a payslip picked from Home, over the page. The job is preset; a different payday or employer is flagged. */
export function PaycheckReview({ item, job, date, jobs, onClose }: { item: ReviewItem; job: Job; date: string; jobs: Job[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const p = item.result.payslip
  const differs = [
    p.checkDate !== date ? `check date ${formatDate(p.checkDate)}, not ${formatDate(date)}` : null,
    matchJob(p.employer, [job]) === null ? `employer “${p.employer}”, not ${job.name}` : null,
  ].filter((d): d is string => d !== null)

  const save = (draft: Parameters<typeof reviewInput>[1]) =>
    start(async () => {
      setMessage(null)
      const result = await savePayslip(reviewInput(item, draft)).catch(() => ({ ok: false as const, message: "Couldn't save. Check your connection and try again." }))
      if (!result.ok) return setMessage(result.message)
      router.refresh()
      onClose()
    })

  return (
    <div role="dialog" aria-label="Review payslip" className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-2">
        <Review
          item={item}
          jobs={jobs}
          initial={draftFor(p, jobs, job.id)}
          pending={pending}
          notice={
            differs.length > 0 ? (
              <p role="status" className="mb-2 rounded-xl bg-[#f7eddb] px-3 py-2 text-[12px] text-[#b7791f]">
                <b className="mr-1.5 rounded-md bg-white/70 px-1.5 py-px text-[10px] font-bold tracking-wider">DIFFERS</b>
                This payslip has {differs.join(' and ')}. Check it is the right one before saving.
              </p>
            ) : null
          }
          onSave={save}
          onClose={onClose}
        />
        {message && (
          <p role="alert" className="rounded-xl bg-white px-3 py-2 text-sm text-[#c0392b]">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
