'use client'

import { useId, useState } from 'react'
import { formatMoney } from '@/lib/domain/money'
import { EntryButton } from './entry-sheet'

type Entry = { id: string; date: string; name: string; cents: number }

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

/** One expense category row; tapping it shows its entries. Closed by default. */
export function ExpenseCategory({ name, cents, entries }: { name: string; cents: number; entries: Entry[] }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  return (
    <div className="border-t border-[#f1f1ec] first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-[13px]"
      >
        <span>
          {name} <span aria-hidden className="text-[#a5a59f]">{open ? '▾' : '▸'}</span>
        </span>
        <span className="tabular-nums">{formatMoney(cents)}</span>
      </button>
      <ul id={listId} hidden={!open} aria-label={`${name} entries`} className="bg-[#fbfbf9] pb-1">
        {entries.map((e) => (
          <li key={e.id}>
            <EntryButton id={e.id} className="flex justify-between py-1.5 pl-8 pr-4 text-[12.5px] text-[#4b4b47]">
              <span>
                {e.name} <span className="text-[#8a8a85]">· {shortDate(e.date)}</span>
              </span>
              <span className="tabular-nums">{formatMoney(e.cents)}</span>
            </EntryButton>
          </li>
        ))}
      </ul>
    </div>
  )
}
