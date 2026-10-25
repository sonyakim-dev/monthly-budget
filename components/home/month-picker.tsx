'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  )
}

/** Calendar button that opens a year + month grid. `month` is the one shown; `today` marks the current month; months outside [min, max] are disabled. */
export function MonthPicker({ month, today, min, max, basePath = '/' }: { month: string; today: string; min: string; max: string; basePath?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  const ref = useRef<HTMLDivElement>(null)
  const currentKey = today.slice(0, 7)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const go = (key: string) => {
    setOpen(false)
    router.push(`${basePath}?month=${key}`)
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label="Choose month"
        aria-expanded={open}
        onClick={() => {
          setYear(Number(month.slice(0, 4)))
          setOpen((o) => !o)
        }}
        className="inline-flex p-1 text-[#5b5b57] hover:text-[#1c1c1a]"
      >
        <CalendarIcon className="size-[22px]" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose month"
          className="absolute left-1/2 top-9 z-30 w-64 -translate-x-1/2 rounded-2xl border border-[#e3e3de] bg-white p-3 shadow-lg"
        >
          <div className="flex items-center justify-between text-sm">
            <button type="button" aria-label="Previous year" disabled={year - 1 < Number(min.slice(0, 4))} onClick={() => setYear((y) => y - 1)} className="px-2 text-[#8a8a85] disabled:text-[#d6d6d1]">
              ‹ {year - 1}
            </button>
            <b>{year}</b>
            <button type="button" aria-label="Next year" disabled={year + 1 > Number(max.slice(0, 4))} onClick={() => setYear((y) => y + 1)} className="px-2 text-[#8a8a85] disabled:text-[#d6d6d1]">
              {year + 1} ›
            </button>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {MONTHS.map((name, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}`
              return (
                <button
                  key={name}
                  type="button"
                  disabled={key < min || key > max}
                  onClick={() => go(key)}
                  className={cn(
                    'rounded-lg py-1.5 text-xs disabled:cursor-not-allowed disabled:text-[#d6d6d1] disabled:hover:bg-transparent',
                    key === month ? 'bg-[#1c1c1a] font-semibold text-white' : 'hover:bg-[#f1f1ec]',
                    key === currentKey && 'outline outline-1 outline-[#2f7d4f]',
                  )}
                >
                  {name}
                </button>
              )
            })}
          </div>
          {month !== currentKey && (
            <button type="button" onClick={() => go(currentKey)} className="mt-2 w-full text-center text-xs text-[#2f7d4f]">
              This month
            </button>
          )}
        </div>
      )}
    </div>
  )
}
