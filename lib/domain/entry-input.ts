import { z } from 'zod'
import { isValidIsoDate } from './dates'
import { parseAmountInput } from './money'

export type EntryKind = 'income' | 'expense' | 'bill' | 'saving'

/** categoryId is NEW_CATEGORY when the entry goes into a new category called newCategory. */
export type EntryInput = { amountCents: number; name: string | null; date: string; categoryId: string | null; newCategory: string | null }

export type EntryErrors = Partial<Record<'amount' | 'name' | 'date' | 'categoryId' | 'newCategory', string>>

export const NEW_CATEGORY = 'new'

/** Every name you type (entries, bills, savings, income, groups, jobs) is at most this long; the database agrees. */
export const NAME_MAX = 30
export const NAME_TOO_LONG = `Keep it to ${NAME_MAX} characters.`

export const AMOUNT_ERROR = 'Enter an amount like 12.50 (more than 0, up to 2 decimals).'

const field = (form: FormData, key: string) => {
  const v = form.get(key)
  return typeof v === 'string' ? v : ''
}

/** Validates the entry sheet. Income and expenses need a category; bills and savings don't have one. */
export function parseEntryForm(form: FormData, kind: EntryKind): { ok: true; data: EntryInput } | { ok: false; errors: EntryErrors } {
  const errors: EntryErrors = {}

  const amountCents = parseAmountInput(field(form, 'amount'))
  if (amountCents === null) errors.amount = AMOUNT_ERROR

  const name = field(form, 'name').trim()
  if (name.length > NAME_MAX) errors.name = NAME_TOO_LONG

  const date = field(form, 'date')
  if (!isValidIsoDate(date)) errors.date = 'Enter a valid date.'

  const needsCategory = kind === 'income' || kind === 'expense'
  const categoryId = field(form, 'categoryId')
  const newCategory = needsCategory && categoryId === NEW_CATEGORY ? field(form, 'newCategory').trim() : null
  if (newCategory !== null) {
    if (!newCategory) errors.newCategory = 'Enter a category name.'
    else if (newCategory.length > NAME_MAX) errors.newCategory = NAME_TOO_LONG
  } else if (needsCategory && !z.uuid().safeParse(categoryId).success) errors.categoryId = 'Choose a category.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, data: { amountCents: amountCents!, name: name || null, date, categoryId: needsCategory ? categoryId : null, newCategory } }
}
