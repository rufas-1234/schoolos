import Link from "next/link";
import type { ReactNode } from "react";

export type PublicPlatformLink = {
  href: string;
  label: string;
};

export function PublicPlatformShell({
  children,
  title,
  schoolName,
  navigation,
}: {
  children: ReactNode;
  title: string;
  schoolName?: string;
  navigation: PublicPlatformLink[];
}) {
  return (
    <div className="min-h-dvh bg-[#f3f8f4] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-violet-900/15 bg-[#dcefe4] px-5 py-6 text-violet-950 lg:flex">
        <Link href="/guide" className="mb-8 flex items-center gap-3 px-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-700 text-lg font-bold text-white" aria-hidden="true">S</span>
          <span>
            <span className="block text-lg font-extrabold tracking-tight">SchoolOS</span>
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">School platform</span>
          </span>
        </Link>
        {schoolName && (
          <div className="mb-5 rounded-xl border border-violet-900/10 bg-white/60 px-3 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700">School workspace</p>
            <p className="mt-1 truncate text-sm font-semibold" title={schoolName}>{schoolName}</p>
          </div>
        )}
        <nav aria-label="SchoolOS navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-violet-950/85 transition hover:bg-white/70 hover:text-violet-950"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-4 border-t border-violet-900/15 pt-4">
          <Link href="/login" className="flex w-full items-center justify-center rounded-xl border border-violet-900/15 bg-white/75 px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-white">
            Sign in
          </Link>
        </div>
      </aside>

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b border-violet-900/15 bg-[#dcefe4] px-4 py-3 text-violet-950 shadow-sm sm:px-6 md:min-h-[76px] md:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold sm:text-base">{title}</p>
            <p className="hidden truncate text-xs text-violet-800 sm:block">{schoolName ?? "SchoolOS school management"}</p>
          </div>
          <Link href="/login" className="shrink-0 rounded-lg border border-violet-900/15 bg-white/70 px-3 py-2 text-sm font-semibold text-violet-900 hover:bg-white sm:px-4">
            Sign in
          </Link>
        </header>
        <nav aria-label="SchoolOS navigation" className="flex gap-2 overflow-x-auto border-b border-violet-900/10 bg-[#f5eef9] px-3 py-2 lg:hidden">
          {navigation.map((item) => (
            <Link key={`${item.href}-${item.label}`} href={item.href} className="shrink-0 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-white">
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
