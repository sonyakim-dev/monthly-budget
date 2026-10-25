// What the review screen sends to save a payslip, checked before it reaches the database.
import { z } from 'zod'
import { isValidIsoDate } from '@/lib/domain/dates'

const KINDS = ['earning', 'pretax', 'tax', 'posttax', 'employer'] as const
const TAGS = [
  'base', 'allowance', 'notice_pay', 'severance', 'cobra_assist', 'bonus',
  'trad_401k', 'roth_401k', 'hsa',
  'federal', 'state', 'ss', 'medicare', 'sdi',
  '401k_match', 'hsa_match', 'other',
] as const
const PAY_TYPES = ['regular', 'notice', 'severance', 'bonus', 'other'] as const
const FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const

export const NEW_JOB = 'new'

const isoDate = z.string().refine(isValidIsoDate, 'Enter a date.')

const reviewSchema = z.object({
  jobId: z.union([z.uuid(), z.literal(NEW_JOB)]),
  newJob: z.object({ name: z.string().trim().min(1).max(30), payFrequency: z.enum(FREQUENCIES) }).optional(),
  checkDate: isoDate,
  periodStart: isoDate.nullable(),
  periodEnd: isoDate.nullable(),
  payType: z.enum(PAY_TYPES),
  grossCents: z.number().int().min(0),
  netCents: z.number().int().positive(),
  reconciled: z.boolean(),
  parseMethod: z.string().min(1).max(40),
  lines: z.array(z.object({ label: z.string().trim().min(1).max(80), kind: z.enum(KINDS), tag: z.enum(TAGS), cents: z.number().int().min(0) })),
})

export type ReviewInput = z.infer<typeof reviewSchema>

export function parseReviewForm(input: unknown): { ok: true; data: ReviewInput } | { ok: false; message: string } {
  const r = reviewSchema.safeParse(input)
  if (!r.success) return { ok: false, message: 'Check the figures: ' + r.error.issues[0]?.message }
  if (r.data.jobId === NEW_JOB && !r.data.newJob) return { ok: false, message: 'Name the new job.' }
  return { ok: true, data: r.data }
}

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** The job a payslip's employer line refers to: same name, or one name starting with the other. */
export function matchJob(employer: string, jobs: { id: string; name: string }[]): string | null {
  const e = fold(employer)
  if (!e) return null
  const exact = jobs.find((j) => fold(j.name) === e)
  if (exact) return exact.id
  const prefix = jobs.find((j) => e.startsWith(fold(j.name)) || fold(j.name).startsWith(e))
  return prefix?.id ?? null
}
