'use client'

import { useState, useTransition } from 'react'
import { savePayslip } from '@/lib/actions/payslips'
import type { Job } from '@/lib/budget/paycheck'
import type { ParseResult } from '@/lib/payslip/parse'
import { matchJob } from '@/lib/payslip/review'
import { formatDate } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import { cn } from '@/lib/utils'

import type { SavedPayslipRef } from './payslip-list'
import { Badge, draftFor, Review, reviewInput, type Draft, type ParsedOk } from './payslip-review'

export type JobRef = Job

type Queued = { id: number; name: string; file: File } & (
  | { state: 'parsing' }
  | { state: 'unreadable'; reason: 'no-text' | 'no-parser' | 'error' }
  | { state: 'parsed'; result: ParsedOk; duplicate: boolean }
)

const UNREADABLE = {
  'no-text': 'No text in this PDF (a scan?). AI reading comes in a later step.',
  'no-parser': "This isn't a layout the app knows yet. AI reading comes in a later step.",
  error: "Couldn't read this file. Check your connection and try again.",
}

/** Desktop upload area plus the review queue. Files are read once by the server and never kept. */
export function PayslipUpload({ saved, jobs }: { saved: SavedPayslipRef[]; jobs: JobRef[] }) {
  const [queue, setQueue] = useState<Queued[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [nextId, setNextId] = useState(1)
  const [notice, setNotice] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  /** Saves the given queued payslips one after another; the ones that saved leave the queue. */
  const save = (items: Extract<Queued, { state: 'parsed' }>[], drafts: Record<number, Draft>) =>
    start(async () => {
      setMessage(null)
      let savedCount = 0
      for (const item of items) {
        const d = drafts[item.id] ?? draftFor(item.result.payslip, jobs)
        const result = await savePayslip(reviewInput(item, d)).catch(() => ({ ok: false as const, message: "Couldn't save. Check your connection and try again." }))
        if (!result.ok) {
          setMessage(`${item.name}: ${result.message}`)
          break
        }
        savedCount++
        setQueue((q) => q.filter((x) => x.id !== item.id))
        setOpen((o) => (o === item.id ? null : o))
      }
      if (savedCount) setNotice(`${savedCount} ${savedCount === 1 ? 'payslip' : 'payslips'} saved`)
    })

  const add = (files: FileList | File[]) => {
    const picked = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    const items: Queued[] = picked.map((file, i) => ({ id: nextId + i, name: file.name, file, state: 'parsing' }))
    setNextId((n) => n + picked.length)
    setQueue((q) => [...q, ...items])
    for (const item of items) parse(item)
  }

  const parse = async (item: Queued) => {
    const body = new FormData()
    body.set('file', item.file)
    let next: Queued
    try {
      const res = await fetch('/api/payslips/parse', { method: 'POST', body })
      const json = (await res.json()) as ParseResult | { error: string }
      if (!res.ok || !('ok' in json)) next = { ...item, state: 'unreadable', reason: 'error' }
      else if (!json.ok) next = { ...item, state: 'unreadable', reason: json.reason }
      else {
        const p = json.payslip
        const duplicate = saved.some((s) => s.employer === p.employer && s.checkDate === p.checkDate && s.netCents === p.netCents)
        next = { ...item, state: 'parsed', result: json, duplicate }
      }
    } catch {
      next = { ...item, state: 'unreadable', reason: 'error' }
    }
    setQueue((q) => q.map((x) => (x.id === item.id ? next : x)))
  }

  const counts = {
    ready: queue.filter((q) => q.state === 'parsed' && !q.duplicate && q.result.status === 'ready').length,
    check: queue.filter((q) => q.state === 'parsed' && !q.duplicate && q.result.status === 'check').length,
    duplicate: queue.filter((q) => q.state === 'parsed' && q.duplicate).length,
    unreadable: queue.filter((q) => q.state === 'unreadable').length,
  }
  const current = queue.find((q) => q.id === open)
  const ready = queue.filter((q): q is Extract<Queued, { state: 'parsed' }> => q.state === 'parsed' && !q.duplicate && q.result.status === 'ready')

  return (
    <div className="space-y-3">
      <label
        data-testid="payslip-drop"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          add(e.dataTransfer.files)
        }}
        className={cn(
          'block cursor-pointer rounded-2xl border-2 border-dashed bg-white px-4 py-6 text-center text-[13px] text-[#5b5b57]',
          dragging ? 'border-[#3a6ea5]' : 'border-[#e3e3de]',
        )}
      >
        <span className="block text-[15px] font-semibold text-[#1c1c1a]">Drop payslip PDFs here</span>
        Pick one or more. Each is read once, then forgotten.
        <span className="mt-2 block">
          <span className="inline-block rounded-lg border border-[#e3e3de] px-3 py-1.5 font-semibold text-[#1c1c1a]">Choose files</span>
        </span>
        <span className="mt-2 block text-[11px] text-[#8a8a85]">Only the figures are saved, never the PDF.</span>
        <input
          type="file"
          accept="application/pdf"
          multiple
          aria-label="Payslip PDFs"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) add(e.target.files)
            e.target.value = ''
          }}
        />
      </label>

      {queue.length > 0 && (
        <div data-testid="payslip-queue" className="overflow-hidden rounded-2xl border border-[#ecece7] bg-white">
          <p className="px-4 py-3 text-sm font-semibold text-[#3f3f3b]">
            Review {queue.length} {queue.length === 1 ? 'payslip' : 'payslips'}
          </p>
          {queue.map((q) => (
            <button
              key={q.id}
              type="button"
              disabled={q.state !== 'parsed'}
              onClick={() => setOpen(q.id)}
              className="flex w-full items-center justify-between gap-3 border-t border-[#f1f1ec] px-4 py-2.5 text-left text-[13px] hover:bg-[#fbfbf9] disabled:cursor-default disabled:hover:bg-white"
            >
              <span>
                {q.name}
                <Badge kind={q.state === 'parsed' ? (q.duplicate ? 'duplicate' : q.result.status) : q.state} />
                <span className="block text-[11px] text-[#8a8a85]">
                  {q.state === 'parsing' && 'Reading…'}
                  {q.state === 'unreadable' && UNREADABLE[q.reason]}
                  {q.state === 'parsed' &&
                    (q.duplicate
                      ? "Same employer, date and net as a saved payslip · won't be saved"
                      : [
                          q.result.payslip.employer,
                          formatDate(q.result.payslip.checkDate),
                          q.result.payslip.payType,
                          q.result.reconciled ? 'reconciles' : `off by ${formatMoney(Math.abs(q.result.differenceCents))}`,
                          ...(q.result.unknownLabels.length ? [`${q.result.unknownLabels.length} unknown line: “${q.result.unknownLabels.join('”, “')}”`] : []),
                        ].join(' · '))}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                {q.state === 'parsed' ? `Net ${formatMoney(q.result.payslip.netCents)}` : '—'}
                {q.state === 'parsed' && <span className="ml-1.5 text-[#a5a59f]">›</span>}
              </span>
            </button>
          ))}
          <div className="flex items-center justify-between border-t border-[#f1f1ec] bg-[#fbfbf9] px-4 py-2.5 text-[13px]">
            <span>
              {counts.ready} ready · {counts.check} to check · {counts.duplicate} duplicate · {counts.unreadable} unreadable
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setQueue([])} className="rounded-lg border border-[#e3e3de] bg-white px-3 py-1.5 text-[#5b5b57]">
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || ready.length === 0 || ready.some((r) => matchJob(r.result.payslip.employer, jobs) === null)}
                title={ready.some((r) => matchJob(r.result.payslip.employer, jobs) === null) ? 'Open each payslip to pick its job first' : undefined}
                onClick={() => save(ready, {})}
                className="rounded-lg bg-[#1c1c1a] px-3 py-1.5 font-semibold text-white disabled:opacity-50"
              >
                {pending ? 'Saving…' : `Save ${ready.length} ready`}
              </button>
            </span>
          </div>
        </div>
      )}

      {message && (
        <p role="alert" className="text-sm text-[#c0392b]">
          {message}
        </p>
      )}
      {notice && (
        <p role="status" className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-xl bg-[#1c1c1a] px-3 py-2 text-xs text-white shadow-lg md:bottom-6">
          {notice}
        </p>
      )}
      {current?.state === 'parsed' && (
        <Review key={current.id} item={current} jobs={jobs} initial={draftFor(current.result.payslip, jobs)} pending={pending} onSave={(d) => save([current], { [current.id]: d })} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
