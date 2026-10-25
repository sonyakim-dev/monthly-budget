'use client'

import { createContext, useActionState, useContext, useMemo, useState, useTransition } from 'react'
import { deleteEntry, saveEntry, type EntryFormState } from '@/lib/actions/entries'
import { NAME_MAX, NEW_CATEGORY, type EntryKind } from '@/lib/domain/entry-input'
import { centsToDecimal } from '@/lib/domain/money'
import { cn } from '@/lib/utils'
import { AmountInput } from './amount-input'
import { Sheet } from './sheet'

export type SheetEntry = {
  id: string
  kind: EntryKind
  amountCents: number
  name: string | null
  date: string
  categoryId: string | null
  locked: boolean
}
export type SheetCategory = { id: string; name: string; kind: 'income' | 'expense' }

type Open = { mode: 'new' } | { mode: 'edit'; entry: SheetEntry }
type Ctx = { openEntry: (id: string) => void; openNew: () => void }

const EntrySheetContext = createContext<Ctx | null>(null)

function useEntrySheet() {
  const ctx = useContext(EntrySheetContext)
  if (!ctx) throw new Error('useEntrySheet must be used inside EntrySheetProvider')
  return ctx
}

/** Holds the month's editable entries and shows the add/edit sheet. */
export function EntrySheetProvider({
  entries,
  categories,
  defaultDate,
  children,
}: {
  entries: SheetEntry[]
  categories: SheetCategory[]
  defaultDate: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState<Open | null>(null)
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const ctx = useMemo<Ctx>(
    () => ({
      openEntry: (id) => {
        const entry = byId.get(id)
        if (entry) setOpen({ mode: 'edit', entry })
      },
      openNew: () => setOpen({ mode: 'new' }),
    }),
    [byId],
  )
  return (
    <EntrySheetContext.Provider value={ctx}>
      {children}
      {open && (
        <EntrySheet
          key={open.mode === 'edit' ? open.entry.id : 'new'}
          open={open}
          categories={categories}
          defaultDate={defaultDate}
          onClose={() => setOpen(null)}
        />
      )}
    </EntrySheetContext.Provider>
  )
}

/** Makes a row tappable to open its entry. */
export function EntryButton({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { openEntry } = useEntrySheet()
  return (
    <button type="button" onClick={() => openEntry(id)} className={cn('block w-full text-left hover:bg-[#fbfbf9]', className)}>
      {children}
    </button>
  )
}

export function AddExpenseButton() {
  const { openNew } = useEntrySheet()
  return (
    <button type="button" onClick={openNew} className="w-full border-b border-[#f1f1ec] px-4 py-2.5 text-left text-[13px] font-semibold text-[#b4443c] hover:bg-[#fbfbf9]">
      ＋ Add Expense
    </button>
  )
}

const label = 'mb-1 block text-xs text-[#8a8a85]'
const input = 'w-full rounded-xl border border-[#e3e3de] bg-white px-3 py-2 text-sm outline-none focus:border-[#3a6ea5]'
const errorText = 'mt-1 text-xs text-[#c0392b]'

function EntrySheet({ open, categories, defaultDate, onClose }: { open: Open; categories: SheetCategory[]; defaultDate: string; onClose: () => void }) {
  const entry = open.mode === 'edit' ? open.entry : null
  const kind: EntryKind = entry?.kind ?? 'expense'
  const choices = categories.filter((c) => c.kind === kind)
  const title = entry ? (entry.name ?? choices.find((c) => c.id === entry.categoryId)?.name ?? 'Entry') : 'Add Expense'

  const [values, setValues] = useState({
    amount: entry ? centsToDecimal(entry.amountCents) : '',
    name: entry?.name ?? '',
    date: entry?.date ?? defaultDate,
    categoryId: entry?.categoryId ?? '',
    newCategory: '',
  })
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  // Saving closes the sheet once it worked; otherwise the form shows what's wrong.
  const [state, formAction, saving] = useActionState<EntryFormState, FormData>(async (prev, form) => {
    const result = await saveEntry(prev, form)
    if (result.ok) onClose()
    return result
  }, {})
  const [confirming, setConfirming] = useState(false)
  const [deleteState, setDeleteState] = useState<EntryFormState>({})
  const [deleting, startDelete] = useTransition()
  const errors = state.errors ?? {}

  const remove = () =>
    startDelete(async () => {
      const result = await deleteEntry(entry!.id)
      if (result.ok) onClose()
      else setDeleteState(result)
    })

  return (
    <Sheet title={title} onClose={onClose}>
        {entry?.locked ? (
          <>
            <p className="text-sm text-[#5b5b57]">This entry comes from a payslip, so it can&apos;t be changed here.</p>
          </>
        ) : (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="id" value={entry?.id ?? ''} />
            <div>
              <label htmlFor="entry-amount" className={label}>
                Amount
              </label>
              <AmountInput id="entry-amount" name="amount" value={values.amount} onValueChange={(amount) => setValues((v) => ({ ...v, amount }))} className={cn(input, 'text-2xl font-bold')} />
              {errors.amount && <p className={errorText}>{errors.amount}</p>}
            </div>
            <div>
              <label htmlFor="entry-name" className={label}>
                Name
              </label>
              <input id="entry-name" name="name" maxLength={NAME_MAX} value={values.name} onChange={set('name')} className={input} />
              {errors.name && <p className={errorText}>{errors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="entry-date" className={label}>
                  Date
                </label>
                <input id="entry-date" name="date" type="date" value={values.date} onChange={set('date')} className={input} />
                {errors.date && <p className={errorText}>{errors.date}</p>}
              </div>
              {(kind === 'income' || kind === 'expense') && (
                <div>
                  <label htmlFor="entry-category" className={label}>
                    Category
                  </label>
                  <select id="entry-category" name="categoryId" value={values.categoryId} onChange={set('categoryId')} className={cn(input, 'pr-9')}>
                    <option value="">Choose…</option>
                    {choices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value={NEW_CATEGORY}>＋ New category…</option>
                  </select>
                  {errors.categoryId && <p className={errorText}>{errors.categoryId}</p>}
                </div>
              )}
              {values.categoryId === NEW_CATEGORY && (
                <div>
                  <label htmlFor="entry-new-category" className={label}>
                    New category name
                  </label>
                  <input id="entry-new-category" name="newCategory" maxLength={NAME_MAX} value={values.newCategory} onChange={set('newCategory')} className={input} />
                  {errors.newCategory && <p className={errorText}>{errors.newCategory}</p>}
                </div>
              )}
            </div>

            {(state.message || deleteState.message) && (
              <p role="alert" className="text-sm text-[#c0392b]">
                {state.message ?? deleteState.message}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              {entry &&
                (confirming ? (
                  <button type="button" onClick={remove} disabled={deleting} className="flex-1 rounded-xl bg-[#c0392b] py-2.5 text-sm font-semibold text-white">
                    {deleting ? 'Removing…' : 'Confirm remove'}
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirming(true)} className="flex-1 rounded-xl border border-[#e3c2bf] py-2.5 text-sm text-[#b4443c]">
                    Remove
                  </button>
                ))}
              <button type="submit" disabled={saving} className="flex-[2] rounded-xl bg-[#1c1c1a] py-2.5 text-sm font-semibold text-white">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
    </Sheet>
  )
}
