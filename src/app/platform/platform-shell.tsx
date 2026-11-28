"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CreditCard, KeyRound, Menu, Search, School, Wallet, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { PlatformSignOutButton } from "./schools/sign-out-button";

const links = [
  { href: "/platform/schools", label: "School workspaces", icon: School, group: "Workspaces" },
  { href: "/platform/plans", label: "Subscription plans", icon: CreditCard, group: "Billing" },
  { href: "/platform/subscriptions", label: "Subscriptions & billing", icon: Wallet, group: "Billing" },
  { href: "/platform/payroll", label: "Staff payroll", icon: Wallet, group: "Operations" },
  { href: "/platform/accounts", label: "Account recovery", icon: KeyRound, group: "Operations" },
];

const groups = [...new Set(links.map((item) => item.group))];

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
  const [leftExpanded, setLeftExpanded] = useState(true);
  const [rightExpanded, setRightExpanded] = useState(false);
  const [leftQuery, setLeftQuery] = useState("");
  const [rightQuery, setRightQuery] = useState("");
  const leftSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const left = window.localStorage.getItem("schoolos-platform-left-sidebar");
    const right = window.localStorage.getItem("schoolos-platform-right-sidebar");
    if (left === "collapsed") setLeftExpanded(false);
    else if (left === "expanded") setLeftExpanded(true);
    if (right === "expanded") setRightExpanded(true);
    else if (right === "collapsed") setRightExpanded(false);
  }, []);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!leftExpanded) {
          setLeftExpanded(true);
          window.localStorage.setItem("schoolos-platform-left-sidebar", "expanded");
        }
        window.setTimeout(() => leftSearchRef.current?.focus(), 40);
      }
    }
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, [leftExpanded]);

  const visibleLinks = useMemo(() => {
    const query = leftQuery.trim().toLocaleLowerCase();
    return links.filter((item) => !query || `${item.label} ${item.group}`.toLocaleLowerCase().includes(query));
  }, [leftQuery]);
  const rightLinks = useMemo(() => {
    const query = rightQuery.trim().toLocaleLowerCase();
    return links.filter((item) => !query || `${item.label} ${item.group}`.toLocaleLowerCase().includes(query));
  }, [rightQuery]);

  const navigation = (compact = false, mobile = false) => (
    <nav aria-label="Platform navigation" className="admin-sidebar-nav min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
      {groups.map((group) => {
        const items = visibleLinks.filter((item) => item.group === group);
        if (!items.length) return null;
        return <section key={group}>
          {!compact && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{group}</p>}
          <div className="space-y-0.5">
            {items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return <Link key={href} href={href} onClick={() => mobile && setMobileOpen(false)} aria-current={active ? "page" : undefined} title={compact ? label : undefined} className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                compact && "justify-center px-0",
                active ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
              )}>
                <Icon size={18} aria-hidden="true"/><span className={cn("truncate", compact && "sr-only")}>{label}</span>
              </Link>;
            })}
          </div>
        </section>;
      })}
      {visibleLinks.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No matching platform pages.</p>}
      {!leftQuery.trim() && <Link href="/guide" onClick={() => mobile && setMobileOpen(false)} title={compact ? "User guide" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100", compact && "justify-center px-0")}>
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-slate-400 text-xs" aria-hidden="true">?</span><span className={cn(compact && "sr-only")}>User guide</span>
      </Link>}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-50 dark:text-slate-900">
      <div id="platform-left-sidebar" className={cn("print:hidden fixed inset-y-0 left-0 z-30 hidden overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block", leftExpanded ? "w-[260px]" : "w-[68px]")}>
        <aside className={cn("flex h-full flex-col overflow-hidden border-r border-slate-200 bg-white py-5 transition-[padding] duration-200", leftExpanded ? "w-[260px] px-4" : "w-[68px] items-center px-2")}>
          <Link href="/platform/schools" aria-label="SchoolOS platform home" title={!leftExpanded ? "SchoolOS platform" : undefined} className={cn("mb-5 flex items-center gap-3 px-1", !leftExpanded && "justify-center")}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f38020] text-white shadow-sm"><School size={23}/></span>
            <span className={cn("min-w-0", !leftExpanded && "hidden")}><span className="block truncate text-sm font-semibold text-slate-900">SchoolOS</span><span className="mt-0.5 block text-xs text-slate-500">Platform administration</span></span>
          </Link>
          <button type="button" title={leftExpanded ? "Collapse left sidebar" : "Expand left sidebar"} aria-label={leftExpanded ? "Collapse left sidebar" : "Expand left sidebar"} aria-controls="platform-left-sidebar" aria-expanded={leftExpanded} onClick={() => setLeftExpanded((expanded) => {
            const next = !expanded;
            window.localStorage.setItem("schoolos-platform-left-sidebar", next ? "expanded" : "collapsed");
            return next;
          })} className={cn("mb-3 flex h-9 items-center rounded-md text-slate-500 transition hover:bg-slate-100", leftExpanded ? "w-full justify-between px-3" : "w-9 justify-center")}>
            {leftExpanded && <span className="text-sm font-medium">Collapse sidebar</span>}{leftExpanded ? <ChevronLeft size={17}/> : <ChevronRight size={17}/>}
          </button>
          {leftExpanded ? <label className="relative mb-3 block">
            <span className="sr-only">Search platform navigation</span><Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input ref={leftSearchRef} type="search" value={leftQuery} onChange={(event) => setLeftQuery(event.target.value)} placeholder="Search platform..." className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-14 text-[13px] text-slate-800 outline-none placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"/>
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Ctrl K</kbd>
          </label> : <button type="button" title="Search platform pages" aria-label="Expand navigation and search" onClick={() => {
            setLeftExpanded(true);
            window.localStorage.setItem("schoolos-platform-left-sidebar", "expanded");
            window.setTimeout(() => leftSearchRef.current?.focus(), 40);
          }} className="mb-3 flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><Search size={17}/></button>}
          {navigation(!leftExpanded)}
          <div className={cn("mt-4 border-t border-slate-200 pt-4", !leftExpanded && "flex w-full flex-col items-center")}>
            <p className={cn("truncate px-3 text-sm font-semibold text-slate-900", !leftExpanded && "sr-only")}>{userName}</p>
            <p className={cn("mb-3 truncate px-3 text-xs text-slate-500", !leftExpanded && "sr-only")}>{userEmail}</p>
            <PlatformSignOutButton compact={!leftExpanded}/>
          </div>
        </aside>
      </div>

      {mobileOpen && <div className="print:hidden fixed inset-0 top-16 z-40 bg-slate-950/30 lg:hidden" onClick={() => setMobileOpen(false)}>
        <aside className="flex h-full w-[min(300px,86vw)] flex-col border-r border-slate-200 bg-white p-5 text-slate-900 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-5 flex items-center justify-between border-b border-slate-200 px-1 pb-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{userName}</p><p className="truncate text-xs text-slate-500">{userEmail}</p></div><button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>
          <label className="relative mb-4 block"><span className="sr-only">Search platform navigation</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="search" value={leftQuery} onChange={(event) => setLeftQuery(event.target.value)} placeholder="Search platform..." className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"/></label>
          {navigation(false, true)}
          <div className="mt-4 border-t border-slate-200 pt-4"><PlatformSignOutButton/></div>
        </aside>
      </div>}

      <div className={cn("min-h-screen transition-[padding] duration-200 ease-out motion-reduce:transition-none", leftExpanded ? "lg:pl-[260px]" : "lg:pl-[68px]", rightExpanded ? "2xl:pr-[260px]" : "2xl:pr-[68px]")}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-3 text-slate-900 shadow-sm sm:px-5 md:h-[76px] md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden"><Menu size={20}/></button>
            <div className="min-w-0"><p className="truncate text-sm font-semibold sm:text-base">SchoolOS platform</p><p className="hidden truncate text-xs text-slate-500 sm:block">Workspace and account administration</p></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4"><span className="hidden max-w-56 truncate text-sm font-medium text-slate-700 md:block">{userName}</span><ThemeToggle/><div className="lg:hidden"><PlatformSignOutButton/></div></div>
        </header>
        <main className="min-h-[calc(100vh-4rem)] md:min-h-[calc(100vh-76px)]">{children}</main>
      </div>

      <div id="platform-right-sidebar" className={cn("print:hidden fixed inset-y-0 right-0 z-10 hidden overflow-hidden border-l border-slate-200 bg-white transition-[width] duration-200 ease-out motion-reduce:transition-none 2xl:block", rightExpanded ? "w-[260px]" : "w-[68px]")}>
        {rightExpanded ? <aside className="flex h-full w-[260px] flex-col px-4 pb-5 pt-[calc(76px+1.25rem)]">
          <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">Platform pages</h2><p className="mt-1 text-xs text-slate-500">Search quick links</p></div><button type="button" title="Collapse right sidebar" aria-label="Collapse right sidebar" aria-controls="platform-right-sidebar" aria-expanded="true" onClick={() => {
            setRightExpanded(false);
            window.localStorage.setItem("schoolos-platform-right-sidebar", "collapsed");
          }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><ChevronRight size={17}/></button></div>
          <label className="relative mb-4 block"><span className="sr-only">Search platform quick links</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="search" value={rightQuery} onChange={(event) => setRightQuery(event.target.value)} placeholder="Search pages..." className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-[13px] text-slate-800 outline-none placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"/></label>
          <nav aria-label="Platform quick links" className="admin-sidebar-nav min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">{groups.map((group) => {
            const items = rightLinks.filter((item) => item.group === group);
            if (!items.length) return null;
            return <section key={group}><p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{group}</p><div className="space-y-1">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium", pathname === href ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950")}><Icon size={15}/><span className="truncate">{label}</span></Link>)}</div></section>;
          })}{!rightLinks.length && <p className="px-2 py-3 text-xs text-slate-500">No matching links.</p>}</nav>
        </aside> : <aside className="flex h-full w-[68px] flex-col items-center border-l border-slate-200 bg-white pt-[calc(76px+1.25rem)]">
          <button type="button" title="Expand right sidebar" aria-label="Expand right sidebar" aria-controls="platform-right-sidebar" aria-expanded="false" onClick={() => {
            setRightExpanded(true);
            window.localStorage.setItem("schoolos-platform-right-sidebar", "expanded");
          }} className="mb-3 flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><ChevronLeft size={17}/></button>
          <div className="flex flex-1 flex-col items-center gap-1">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} title={label} aria-label={label} aria-current={pathname === href ? "page" : undefined} className={cn("flex h-9 w-9 items-center justify-center rounded-md", pathname === href ? "bg-violet-50 text-violet-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900")}><Icon size={16}/></Link>)}</div>
        </aside>}
      </div>
    </div>
  );
}
