'use client'

import Link from 'next/link'
import Image from 'next/image'
import appIcon from '@/app/icon.png'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/summary', label: 'Summary' },
  { href: '/plan', label: 'Plan' },
] as const

/** Sidebar on laptops, bottom tab bar on phones. */
export function AppNav() {
  const pathname = usePathname()
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))

  return (
    <>
      <nav aria-label="Main" className="hidden w-44 shrink-0 flex-col gap-1 border-r border-[#ecece7] p-4 md:flex">
        <p className="mb-4 flex items-center gap-2 px-2">
          <Image src={appIcon} alt="" width={28} height={28} className="rounded-md" />
          <span className="text-[22px] leading-none font-normal tracking-[-0.04em]" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
            Sumday
          </span>
        </p>
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active(item.href) ? 'page' : undefined}
            className={cn('rounded-lg px-3 py-2 text-sm text-[#6f6f6a]', active(item.href) && 'bg-[#efefea] font-semibold text-[#1c1c1a]')}
          >
            {item.label}
          </Link>
        ))}
        <form action="/auth/signout" method="post" className="mt-auto">
          <button type="submit" className="px-3 py-2 text-sm text-[#8a8a85] hover:underline">
            Sign out
          </button>
        </form>
      </nav>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-[#ecece7] bg-[#fafaf8] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active(item.href) ? 'page' : undefined}
            className={cn('flex h-14 items-center justify-center text-xs text-[#8a8a85]', active(item.href) && 'font-bold text-[#1c1c1a]')}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
