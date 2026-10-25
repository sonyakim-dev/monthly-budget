'use client'

import { useId, useRef } from 'react'

/** Opens the sheet as soon as it's on the page. */
const openOnMount = (dialog: HTMLDialogElement | null) => {
  if (dialog && !dialog.open) dialog.showModal()
}

/**
 * A modal sheet: slides up from the bottom on phones and sits on the right on laptops.
 * × or tapping the dimmed area outside closes it. To close it from inside, call `onClose` (the parent removes the sheet).
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = useId()
  // The content fills the <dialog>, so a click whose target is the dialog itself landed on the backdrop.
  // Both press and release must be there, so dragging out of a field doesn't close the sheet.
  const pressedBackdrop = useRef(false)

  return (
    <dialog
      ref={openOnMount}
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) e.currentTarget.close()
        pressedBackdrop.current = false
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none rounded-t-3xl bg-white p-0 text-[#1c1c1a] shadow-2xl backdrop:bg-black/40 md:inset-y-0 md:left-auto md:right-0 md:h-dvh md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-3xl"
    >
      <div className="space-y-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div aria-hidden className="mx-auto h-1 w-9 rounded-full bg-[#ddd] md:hidden" />
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={(e) => e.currentTarget.closest('dialog')?.close()}
            className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-xl leading-none text-[#8a8a85] hover:bg-[#f1f1ec] hover:text-[#1c1c1a]"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

export const sheetStyles = {
  label: 'mb-1 block text-xs text-[#8a8a85]',
  input: 'w-full rounded-xl border border-[#e3e3de] bg-white px-3 py-2 text-sm outline-none focus:border-[#3a6ea5]',
  select: 'w-full rounded-xl border border-[#e3e3de] bg-white py-2 pl-3 pr-10 text-sm outline-none focus:border-[#3a6ea5]',
  error: 'mt-1 text-xs text-[#c0392b]',
  meta: '-mt-3 text-xs text-[#8a8a85]',
  primary: 'flex-[2] rounded-xl bg-[#1c1c1a] py-2.5 text-sm font-semibold text-white disabled:opacity-60',
  secondary: 'flex-1 rounded-xl border border-[#e3e3de] py-2.5 text-sm text-[#5b5b57]',
  warn: 'flex-1 rounded-xl border border-[#e3c2bf] py-2.5 text-sm text-[#b4443c]',
  danger: 'flex-[2] rounded-xl bg-[#c0392b] py-2.5 text-sm font-semibold text-white disabled:opacity-60',
}
