"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { KeyRound, Menu, School, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { PlatformSignOutButton } from "./schools/sign-out-button";

const links = [
  { href: "/platform/schools", label: "School workspaces", icon: School },
  { href: "/platform/accounts", label: "Account recovery", icon: KeyRound },
];

export function PlatformShell({
  children,
  userName,
  userEmail,
}: {
  children: ReactNode;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigation = (
    <nav aria-label="Platform navigation" className="space-y-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition",
              active
                ? "bg-violet-700 text-white shadow-sm"
                : "text-violet-950 hover:bg-white/70",
            )}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
      <Link
        href="/guide"
        onClick={() => setMobileOpen(false)}
        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-violet-950 transition hover:bg-white/70"
      >
        <span className="flex h-[18px] w-[18px] items-center justify-center text-base" aria-hidden="true">?</span>
        User guide
      </Link>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f3f8f4] text-slate-900 dark:bg-[#0b1c19] dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-violet-900/15 bg-[#dcefe4] px-5 py-6 text-violet-950 lg:flex">
        <Link href="/platform/schools" className="mb-8 flex items-center gap-3 px-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-700 text-white"><School size={23} /></span>
          <span>
            <span className="block text-lg font-extrabold tracking-tight">SchoolOS</span>
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Platform</span>
          </span>
        </Link>
        {navigation}
        <div className="mt-auto border-t border-violet-900/15 pt-4">
          <p className="truncate px-3 text-sm font-bold">{userName}</p>
          <p className="mb-3 truncate px-3 text-xs text-violet-800">{userEmail}</p>
          <PlatformSignOutButton />
        </div>
      </aside>

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-violet-900/15 bg-[#dcefe4] px-3 text-violet-950 shadow-sm sm:px-5 md:h-[76px] md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-900/15 bg-white/60 lg:hidden"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold sm:text-base">SchoolOS platform</p>
              <p className="hidden truncate text-xs text-violet-800 sm:block">Workspace and account administration</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden max-w-56 truncate text-sm font-semibold md:block">{userName}</span>
            <ThemeToggle />
            <div className="lg:hidden"><PlatformSignOutButton /></div>
          </div>
        </header>

        {mobileOpen && (
          <div className="fixed inset-0 top-16 z-40 bg-slate-950/30 lg:hidden" onClick={() => setMobileOpen(false)}>
            <aside
              className="h-full w-[min(300px,86vw)] border-r border-violet-900/15 bg-[#dcefe4] p-5 text-violet-950 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 border-b border-violet-900/15 px-3 pb-4">
                <p className="truncate text-sm font-bold">{userName}</p>
                <p className="truncate text-xs text-violet-800">{userEmail}</p>
              </div>
              {navigation}
            </aside>
          </div>
        )}

        <main className="min-h-[calc(100vh-4rem)] md:min-h-[calc(100vh-76px)]">{children}</main>
      </div>
    </div>
  );
}
