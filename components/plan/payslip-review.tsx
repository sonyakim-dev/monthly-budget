'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { updateJobFromPayslip } from '@/lib/actions/jobs'
import type { Job } from '@/lib/budget/paycheck'
import { formatDate } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import type { ParseResult } from '@/lib/payslip/parse'
import { NEW_JOB, matchJob, type ReviewInput } from '@/lib/payslip/review'
import type { ParsedPayslip } from '@/lib/payslip/types'
import { proposePayChange, verifyAgainstJob, type VerifyRow } from '@/lib/payslip/verify'
import { cn } from '@/lib/utils'

export type ParsedOk = Extract<ParseResult, { ok: true }>

/** One payslip being reviewed: the file (for the preview), what the parser read, and whether it's already saved. */
export type ReviewItem = { name: string; file: File; result: ParsedOk; duplicate: boolean }

/** What one payslip will be saved as: the parsed figures plus the reviewer's choices. */
export type Draft = { jobId: string; newJobName: string; newJobFrequency: string; tags: Record<string, string> }

export const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Monthly' },
]

const TAG_OPTIONS: Record<ParsedPayslip['lines'][number]['kind'], { value: string; label: string }[]> = {
  earning: [
    ['base', 'Base pay'], ['allowance', 'Allowance'], ['bonus', 'Bonus'], ['notice_pay', 'Notice pay'], ['severance', 'Severance'], ['cobra_assist', 'COBRA assistance'], ['other', 'Other'],
  ].map(([value, label]) => ({ value, label })),
  tax: [['federal', 'Federal'], ['state', 'State'], ['ss', 'Social Security'], ['medicare', 'Medicare'], ['sdi', 'Disability (SDI)'], ['other', 'Other']].map(([value, label]) => ({ value, label })),
  pretax: [['trad_401k', '401(k) traditional'], ['hsa', 'HSA'], ['other', 'Other']].map(([value, label]) => ({ value, label })),
  posttax: [['roth_401k', '401(k) Roth'], ['other', 'Other']].map(([value, label]) => ({ value, label })),
  employer: [['401k_match', '401(k) match'], ['hsa_match', 'HSA employer'], ['other', 'Other']].map(([value, label]) => ({ value, label })),
}

const KINDS: Record<ParsedPayslip['lines'][number]['kind'], string> = {
  earning: 'EARNINGS',
  tax: 'TAXES',
  pretax: 'PRE-TAX DEDUCTIONS',
  posttax: 'POST-TAX DEDUCTIONS',
  employer: 'EMPLOYER PAID',
}

const BADGE = {
  ready: ['READY', 'bg-[#e7f3ea] text-[#2f7d4f]'],
  check: ['CHECK', 'bg-[#f7eddb] text-[#b7791f]'],
  duplicate: ['DUPLICATE', 'bg-[#ededE8] text-[#5b5b57]'],
  unreadable: ["COULDN'T READ", 'bg-[#f8e3e0] text-[#c0392b]'],
  parsing: ['READING…', 'bg-[#ededE8] text-[#8a8a85]'],
} as const

export function Badge({ kind }: { kind: keyof typeof BADGE }) {
  const [text, cls] = BADGE[kind]
  return <span className={cn('ml-2 rounded-md px-1.5 py-px text-[10px] font-bold tracking-wider', cls)}>{text}</span>
}

/** The reviewer's starting choices: the job matched by employer name (or a new one) and the parser's tags. */
export function draftFor(p: ParsedPayslip, jobs: Job[], jobId?: string): Draft {
  return {
    jobId: jobId ?? matchJob(p.employer, jobs) ?? NEW_JOB,
    newJobName: p.employer.slice(0, 30),
    newJobFrequency: 'biweekly',
    tags: Object.fromEntries(p.lines.map((l) => [`${l.kind}|${l.label}`, l.tag])),
  }
}

/** What `savePayslip` is sent for a reviewed payslip. */
export function reviewInput(item: ReviewItem, d: Draft): ReviewInput {
  const p = item.result.payslip
  return {
    jobId: d.jobId,
    newJob: d.jobId === NEW_JOB ? { name: d.newJobName, payFrequency: d.newJobFrequency as NonNullable<ReviewInput['newJob']>['payFrequency'] } : undefined,
    checkDate: p.checkDate,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    payType: p.payType,
    grossCents: p.grossCents,
    netCents: p.netCents,
    reconciled: item.result.reconciled,
    parseMethod: p.parser,
    lines: p.lines.map((l) => ({ label: l.label, kind: l.kind, tag: (d.tags[`${l.kind}|${l.label}`] ?? l.tag) as ReviewInput['lines'][number]['tag'], cents: l.cents })),
  }
}

/** One payslip: the browser-drawn preview on the left; the job, header, and lines (with editable "counts as") on the right. */
export function Review({
  item,
  jobs,
  initial,
  pending,
  notice,
  onSave,
  onClose,
}: {
  item: ReviewItem
  jobs: Job[]
  initial: Draft
  pending: boolean
  /** Shown above the figures, e.g. when the payslip doesn't match the payday it was opened from. */
  notice?: React.ReactNode
  onSave: (draft: Draft) => void
  onClose: () => void
}) {
  const p = item.result.payslip
  const [url] = useState(() => URL.createObjectURL(item.file))
  const [draft, setDraft] = useState<Draft>(initial)
  const select = 'w-full rounded-lg border border-[#e3e3de] bg-white py-1.5 pl-2 pr-8 text-[12px]'
  const groups = (Object.keys(KINDS) as (keyof typeof KINDS)[]).map((kind) => ({ kind, lines: p.lines.filter((l) => l.kind === kind) })).filter((g) => g.lines.length)

  return (
    <div data-testid="payslip-review" className="rounded-2xl border border-[#ecece7] bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-base font-bold">
          {item.name}
          <Badge kind={item.duplicate ? 'duplicate' : item.result.status} />
        </p>
        <button type="button" onClick={onClose} aria-label="Close review" className="text-xl text-[#8a8a85]">
          ×
        </button>
      </div>
      <div className="grid gap-3 border-t border-[#f1f1ec] p-3 md:grid-cols-[360px_1fr]">
        <div className="overflow-hidden rounded-xl border border-[#ecece7]">
          <p className="border-b border-[#f1f1ec] px-3 py-1.5 text-[11px] text-[#8a8a85]">Preview · drawn in your browser</p>
          <object data={url} type="application/pdf" aria-label="Payslip preview" className="h-[440px] w-full" />
        </div>
        <div>
          {notice}
          <div className="grid grid-cols-2 gap-2 px-1 text-[12px]">
            <div>
              <label htmlFor="review-job" className="block text-[11px] text-[#8a8a85]">
                Job
              </label>
              <select id="review-job" value={draft.jobId} onChange={(e) => setDraft((d) => ({ ...d, jobId: e.target.value }))} className={select}>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
                <option value={NEW_JOB}>＋ New job…</option>
              </select>
            </div>
            {draft.jobId === NEW_JOB && (
              <>
                <div>
                  <label htmlFor="review-new-job" className="block text-[11px] text-[#8a8a85]">
                    New job name
                  </label>
                  <input id="review-new-job" maxLength={30} value={draft.newJobName} onChange={(e) => setDraft((d) => ({ ...d, newJobName: e.target.value }))} className={select} />
                </div>
                <div>
                  <label htmlFor="review-new-freq" className="block text-[11px] text-[#8a8a85]">
                    Pays
                  </label>
                  <select id="review-new-freq" value={draft.newJobFrequency} onChange={(e) => setDraft((d) => ({ ...d, newJobFrequency: e.target.value }))} className={select}>
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-4 gap-2 px-1 text-[12px]">
            {[
              ['Employer', p.employer],
              ['Check date', formatDate(p.checkDate)],
              ['Pay type', p.payType],
              ['Period', p.periodStart && p.periodEnd ? `${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}` : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-[#8a8a85]">{k}</dt>
                <dd className="rounded-lg border border-[#e3e3de] px-2 py-1.5">{v}</dd>
              </div>
            ))}
          </dl>
          <table className="mt-2 w-full text-[12px]">
            <thead>
              <tr className="text-[10px] tracking-wider text-[#8a8a85]">
                <th className="px-2 py-1 text-left font-bold">LINE</th>
                <th className="px-2 py-1 text-left font-bold">COUNTS AS</th>
                <th className="px-2 py-1 text-right font-bold">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.kind} kind={g.kind} title={KINDS[g.kind]} lines={g.lines} tags={draft.tags} onTag={(key, tag) => setDraft((d) => ({ ...d, tags: { ...d.tags, [key]: tag } }))} />
              ))}
            </tbody>
          </table>
          <dl className="mt-3 grid grid-cols-2 gap-2 px-1 text-[12px]">
            <div>
              <dt className="text-[11px] text-[#8a8a85]">Gross</dt>
              <dd className="rounded-lg border border-[#e3e3de] px-2 py-1.5 tabular-nums">{formatMoney(p.grossCents)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-[#8a8a85]">Net</dt>
              <dd className="rounded-lg border border-[#e3e3de] px-2 py-1.5 tabular-nums">{formatMoney(p.netCents)}</dd>
            </div>
          </dl>
          <p
            role="status"
            className={cn(
              'mt-3 flex justify-between rounded-xl px-3 py-2 text-[12px]',
              item.result.reconciled ? 'bg-[#e7f3ea] text-[#24603b]' : 'bg-[#f8e3e0] text-[#8f2b22]',
            )}
          >
            <span>Gross − taxes − deductions = net</span>
            <b>{item.result.reconciled ? '✓ reconciles' : `off by ${formatMoney(Math.abs(item.result.differenceCents))}`}</b>
          </p>
          {p.mismatches.length > 0 && <p className="mt-2 px-1 text-[12px] text-[#b7791f]">Doesn&apos;t match the statement&apos;s own totals: {p.mismatches.join(', ')}.</p>}
          <VerifyTable payslip={p} tags={draft.tags} job={jobs.find((j) => j.id === draft.jobId) ?? null} />
          <div className="mt-3 flex justify-end gap-2">
            {item.duplicate ? (
              <p className="text-[12px] text-[#8a8a85]">Already saved, so this one won&apos;t be.</p>
            ) : (
              <button
                type="button"
                disabled={pending || (draft.jobId === NEW_JOB && !draft.newJobName.trim())}
                onClick={() => onSave(draft)}
                className={cn('rounded-lg px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50', item.result.reconciled ? 'bg-[#1c1c1a] text-white' : 'border border-[#e3c2bf] bg-white text-[#b4443c]')}
              >
                {pending ? 'Saving…' : item.result.reconciled ? 'Save payslip' : 'Save anyway ⚠'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const VERDICT: Record<VerifyRow['status'], [string, string]> = {
  ok: ['OK', 'bg-[#e7f3ea] text-[#2f7d4f]'],
  differs: ['DIFFERS', 'bg-[#f7eddb] text-[#b7791f]'],
  info: ['INFO', 'bg-[#ededE8] text-[#5b5b57]'],
}

/**
 * What the payslip implies versus what Jobs says for the check date, with the lines as currently tagged.
 * When the 401(k) rates or HSA differ, one button records them on the job from the pay period start.
 */
function VerifyTable({ payslip, tags, job }: { payslip: ParsedPayslip; tags: Record<string, string>; job: Job | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [updated, setUpdated] = useState<string | null>(null)
  const lines = payslip.lines.map((l) => ({ kind: l.kind, tag: tags[`${l.kind}|${l.label}`] ?? l.tag, cents: l.cents }))
  const figures = { checkDate: payslip.checkDate, periodStart: payslip.periodStart, grossCents: payslip.grossCents, lines }
  const rows = job ? verifyAgainstJob(figures, job) : null
  const change = job && rows ? proposePayChange(figures, job) : null
  const title = job ? `Compared with ${job.name} on ${formatDate(payslip.checkDate)}` : 'Compared with the job'

  const update = () =>
    start(async () => {
      setMessage(null)
      const result = await updateJobFromPayslip({ jobId: job!.id, ...change! }).catch(() => ({ ok: false as const, message: "Couldn't save. Check your connection and try again." }))
      if (!result.ok) return setMessage(result.message)
      setUpdated(`${job!.name} updated from ${formatDate(change!.effectiveDate)}.`)
      router.refresh()
    })

  return (
    <section aria-label="Compared with the job" className="mt-3 overflow-hidden rounded-xl border border-[#ecece7]">
      <p className="border-b border-[#f1f1ec] px-3 py-1.5 text-[11px] text-[#8a8a85]">
        {title} <i>from Jobs</i>
      </p>
      {rows ? (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] tracking-wider text-[#8a8a85]">
              <th className="px-3 py-1 text-left font-bold">WHAT</th>
              <th className="px-2 py-1 text-right font-bold">PAYSLIP</th>
              <th className="px-2 py-1 text-right font-bold">JOB SAYS</th>
              <th className="px-3 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const [text, cls] = VERDICT[r.status]
              return (
                <tr key={r.what} className="border-t border-[#f1f1ec]">
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.what}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{r.payslip}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-[#5b5b57]">{r.job}</td>
                  <td className="px-3 py-1.5 text-right">
                    <span className={cn('rounded-md px-1.5 py-px text-[10px] font-bold tracking-wider', cls)}>{text}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="px-3 py-2 text-[12px] text-[#8a8a85]">{job ? `No pay details for ${job.name} on this date yet, so nothing to compare.` : 'Pick a job to compare its pay details with this payslip.'}</p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-[#f1f1ec] bg-[#fbfbf9] px-3 py-2 text-[11px] text-[#8a8a85]">
        <span>
          {message ? <span role="alert" className="text-[#c0392b]">{message}</span> : updated ? <span role="status" className="text-[#2f7d4f]">{updated}</span> : 'Taxes are only ever an estimate; a difference there is shown, not fixed. Nothing changes until you choose to.'}
        </span>
        {change && !updated && (
          <button type="button" disabled={pending} onClick={update} className="shrink-0 rounded-lg bg-[#1c1c1a] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
            {pending ? 'Saving…' : `Update job from ${formatDate(change.effectiveDate)}: ${change.summary}`}
          </button>
        )}
      </div>
    </section>
  )
}

function GroupRows({
  kind,
  title,
  lines,
  tags,
  onTag,
}: {
  kind: ParsedPayslip['lines'][number]['kind']
  title: string
  lines: ParsedPayslip['lines']
  tags: Record<string, string>
  onTag: (key: string, tag: string) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={3} className="px-2 pt-3 pb-1 text-[10px] font-bold tracking-wider text-[#8a8a85]">
          {title}
        </td>
      </tr>
      {lines.map((l) => (
        <tr key={`${l.kind}-${l.label}`} className={cn('border-t border-[#f1f1ec]', l.unknown && 'bg-[#fdf6e7]')}>
          <td className="px-2 py-1.5">
            {l.label}
            {l.unknown && <span className="ml-2 rounded-md bg-[#f7eddb] px-1.5 py-px text-[10px] font-bold tracking-wider text-[#b7791f]">NEW LABEL</span>}
          </td>
          <td className="px-2 py-1.5">
            <select aria-label={`${l.label} counts as`} value={tags[`${kind}|${l.label}`] ?? l.tag} onChange={(e) => onTag(`${kind}|${l.label}`, e.target.value)} className="rounded-lg border border-[#e3e3de] bg-white py-1 pl-2 pr-7 text-[11px] text-[#5b5b57]">
              {TAG_OPTIONS[kind].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </td>
          <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(l.cents)}</td>
        </tr>
      ))}
    </>
  )
}
