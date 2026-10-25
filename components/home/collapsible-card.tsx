'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  /** One line explaining what the card counts, shown by the ⓘ next to the title. */
  info?: string
  dot: string
  total: string
  totalTestId: string
  className?: string
  children: React.ReactNode
}

const TIP_WIDTH = 256

/** A white card whose header folds the body away. Open by default. */
export function CollapsibleCard({ title, info, dot, total, totalTestId, className, children }: Props) {
  const [open, setOpen] = useState(true)
  // The ⓘ note floats above the page, so the card can't clip it and nothing moves.
  // A click or tap keeps it open (pinned); on a laptop, hovering shows it too.
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)
  const bodyId = useId()
  const tipId = useId()
  const tipButton = useRef<HTMLButtonElement>(null)
  const tip = (pinned || hovered) && place !== null

  const measure = () => {
    const r = tipButton.current?.getBoundingClientRect()
    if (r) setPlace({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - TIP_WIDTH - 8)) })
  }

  // A pinned note closes on a click anywhere else, Escape, or scrolling.
  useEffect(() => {
    if (!pinned) return
    const onClick = (e: MouseEvent) => {
      if (!tipButton.current?.contains(e.target as Node)) setPinned(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPinned(false)
      setHovered(false)
    }
    const onScroll = () => setPinned(false)
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
    }
  }, [pinned])

  return (
    <section className={cn('overflow-hidden rounded-2xl border border-[#ecece7] bg-white', className)}>
      {/* The fold button covers the whole header; the ⓘ sits on top of it. */}
      <div className="relative flex items-center justify-between px-4 py-3">
        <button type="button" aria-label={title} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)} className="absolute inset-0" />
        <span className="pointer-events-none relative flex items-center gap-2 text-sm font-semibold text-[#3f3f3b]">
          <span aria-hidden className="size-2 rounded-full" style={{ background: dot }} />
          {title}
          {info && (
            <button
              ref={tipButton}
              type="button"
              aria-label={`About ${title}`}
              aria-expanded={tip}
              aria-controls={tipId}
              onClick={() => {
                measure()
                setPinned((p) => !p)
              }}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'mouse') return
                measure()
                setHovered(true)
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setHovered(false)
              }}
              className="pointer-events-auto -m-1 flex size-6 items-center justify-center rounded-full text-[13px] font-normal text-[#a5a59f] hover:text-[#5b5b57]"
            >
              ⓘ
            </button>
          )}
        </span>
        <span className="pointer-events-none relative flex items-center gap-2">
          <span data-testid={totalTestId} className="text-sm font-bold tabular-nums">
            {total}
          </span>
          <span aria-hidden className="text-xs text-[#a5a59f]">
            {open ? '▾' : '▸'}
          </span>
        </span>
      </div>
      {info &&
        tip &&
        createPortal(
          <p id={tipId} role="note" style={{ top: place.top, left: place.left, width: TIP_WIDTH }} className="fixed z-50 rounded-xl bg-[#1c1c1a] px-3 py-2 text-xs leading-snug text-white shadow-lg">
            {info}
          </p>,
          document.body,
        )}
      <div id={bodyId} hidden={!open} className="border-t border-[#f1f1ec]">
        {children}
      </div>
    </section>
  )
}
