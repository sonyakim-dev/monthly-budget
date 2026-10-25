import { AppNav } from '@/components/app-nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#fafaf8] text-[#1c1c1a] md:flex">
      <AppNav />
      <main className="mx-auto min-h-dvh w-full max-w-5xl flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 min-[1400px]:max-w-[1640px]">
        {/* Pages start at the top, so switching months doesn't move anything. */}
        <div>{children}</div>
      </main>
    </div>
  )
}
