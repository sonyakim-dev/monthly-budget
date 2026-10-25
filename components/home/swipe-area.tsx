'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { addMonths, type MonthKey } from '@/lib/domain/dates'

// Touch: drag past this share of the width, or flick at least FLICK_PX within FLICK_MS, to change month.
const DRAG_SHARE = 0.25
const FLICK_PX = 40
const FLICK_MS = 250
const GLIDE = { duration: 150, easing: 'cubic-bezier(.2,.8,.2,1)' }
// The month only hints at the swipe: it moves a third as far as the fingers, at most this far, so no big gap opens.
const FOLLOW_SHARE = 1 / 3
const FOLLOW_MAX_PX = 80
// How far it glides off before the new month glides in.
const GLIDE_OFF_PX = 60

/**
 * Swipe left for the next month, right for the previous one (touch screens).
 * The month follows the swipe, then glides off and the new month glides in; a short swipe springs back.
 * ← → keys work too. You can browse from `min` to `max`.
 */
export function SwipeArea({ month, min, max, children }: { month: MonthKey; min: MonthKey; max: MonthKey; children: React.ReactNode }) {
  const router = useRouter()
  const content = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number; at: number; dx: number; axis: 'x' | 'y' | null } | null>(null)
  // Which way the last switch went, worked out from the month shown before (no glide on the first visit).
  const [shown, setShown] = useState<{ month: MonthKey; slide: 'next' | 'prev' | null }>({ month, slide: null })
  if (shown.month !== month) setShown({ month, slide: month > shown.month ? 'next' : 'prev' })

  // One month at a time, from the month on screen; null at either end of the range.
  const target = (by: -1 | 1) => {
    const to = addMonths(month, by)
    return to < min || to > max ? null : to
  }

  const width = () => content.current?.offsetWidth || window.innerWidth
  // Three months side by side: switching is instant, so nothing follows the swipe.
  const wide = () => window.matchMedia('(min-width: 1400px)').matches

  // While swiping, the month leans the way of the fingers (barely at either end of the range).
  const follow = (dx: number) => {
    const el = content.current
    if (!el || wide()) return
    const share = target(dx < 0 ? 1 : -1) ? FOLLOW_SHARE : FOLLOW_SHARE / 4
    const pull = Math.max(-FOLLOW_MAX_PX, Math.min(FOLLOW_MAX_PX, dx * share))
    for (const a of el.getAnimations()) a.cancel()
    el.style.transform = `translateX(${pull}px)`
    el.style.opacity = String(1 - (Math.abs(pull) / FOLLOW_MAX_PX) * 0.3)
  }

  // Animates from wherever the month is on screen now (mid-swipe or mid-glide) to `to`.
  const glide = (to: Keyframe, options: KeyframeAnimationOptions) => {
    const el = content.current
    if (!el) return
    const { transform, opacity } = getComputedStyle(el)
    for (const a of el.getAnimations()) a.cancel()
    el.style.transform = ''
    el.style.opacity = ''
    el.animate([{ transform, opacity }, to], { ...GLIDE, ...options })
  }

  const springBack = () => glide({ transform: 'none', opacity: 1 }, {})

  // Glides the month off to the side, then goes; the new month glides in when it arrives.
  const go = (by: -1 | 1) => {
    const to = target(by)
    if (!to) return springBack()
    if (!wide()) glide({ transform: `translateX(${by * -GLIDE_OFF_PX}px)`, opacity: 0 }, { easing: 'ease-in', fill: 'forwards' })
    router.push(`/?month=${to}`)
  }

  // ← → anywhere on the page (except while typing), so it listens on the window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      data-testid="swipe-area"
      // The browser keeps scrolling up and down; sideways moves are ours.
      className="touch-pan-y overflow-x-clip"
      onTouchStart={(e) => {
        const t = e.changedTouches[0]
        touch.current = { x: t.clientX, y: t.clientY, at: e.timeStamp, dx: 0, axis: null }
      }}
      onTouchMove={(e) => {
        const s = touch.current
        if (!s) return
        const t = e.changedTouches[0]
        const dx = t.clientX - s.x
        const dy = t.clientY - s.y
        if (!s.axis) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return
          s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        }
        if (s.axis !== 'x') return
        s.dx = dx
        follow(dx)
      }}
      onTouchEnd={(e) => {
        const s = touch.current
        touch.current = null
        if (s?.axis !== 'x') return
        const flick = e.timeStamp - s.at < FLICK_MS && Math.abs(s.dx) >= FLICK_PX
        if (Math.abs(s.dx) >= width() * DRAG_SHARE || flick) go(s.dx < 0 ? 1 : -1)
        else springBack()
      }}
      onTouchCancel={() => {
        touch.current = null
        springBack()
      }}
    >
      <div ref={content} key={month} className={shown.slide ? `month-in-${shown.slide}` : undefined}>
        {children}
      </div>
    </div>
  )
}
