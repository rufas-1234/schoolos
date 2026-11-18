"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { GraduationCap, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { schoolLogoSource } from "@/lib/school-logo";
import { cn } from "@/lib/utils";

export type PortalNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function PortalShell({
  children,
  schoolName,
  schoolLogoUrl,
  userName,
  portalLabel,
  navigation,
}: {
  children: ReactNode;
  schoolName: string;
  schoolLogoUrl: string | null;
  userName: string;
  portalLabel: string;
  navigation: PortalNavigationItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [activeAnchor, setActiveAnchor] = useState("");
  const logo = schoolLogoSource(schoolLogoUrl);

  async function signOut() {
    setSignOutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSignOutError("Sign out failed. Please try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Sign out failed. Please try again.");
    }
  }

  function navHref(href: string) {
    return href.startsWith("#") ? `${pathname}${href}` : href;
  }

  function renderNavigation(mobile = false) {
    return navigation.map(({ href, label, icon: Icon }) => {
      const target = navHref(href);
      const [targetPath, targetQuery] = href.split("?");
      const targetSection = new URLSearchParams(targetQuery ?? "").get("section");
      const active = href.startsWith("#")
        ? activeAnchor === href
        : pathname === targetPath && searchParams.get("section") === targetSection;
      return (
        <Link
          key={href}
          href={target}
          onClick={() => {
            setActiveAnchor(href.startsWith("#") ? href : "");
            if (mobile) setMobileMenuOpen(false);
          }}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
            active
              ? "bg-white/85 text-violet-950 shadow-sm"
              : "text-violet-950/85 hover:bg-white/50 hover:text-violet-950",
          )}
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </Link>
      );
    });
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 md:grid md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden h-dvh flex-col border-r border-violet-900/15 bg-[#eadcf4] px-5 py-6 md:sticky md:top-0 md:flex">
        <Link href={navHref(navigation[0]?.href ?? "/")} className="mb-9 flex items-center gap-3 px-1">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/75 text-violet-900 shadow-sm">
            {logo
              ? <Image src={logo} unoptimized width={44} height={44} alt={`${schoolName} logo`} className="h-full w-full object-contain" />
              : <GraduationCap size={24} aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-violet-950">{schoolName}</span>
            <span className="mt-0.5 block text-xs text-violet-900/75">{portalLabel}</span>
          </span>
        </Link>
        <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-900/75">
          Workspace
        </p>
        <nav aria-label={`${portalLabel} navigation`} className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {renderNavigation()}
        </nav>
        <div className="mt-5 border-t border-violet-900/15 pt-4">
          <p className="truncate px-3 text-sm font-semibold text-violet-950">{userName}</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-3 inline-flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-violet-950/85 transition hover:bg-white/50"
          >
            <LogOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
          <div className="flex min-h-[4.5rem] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 md:hidden"
              >
                {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-violet-800">{portalLabel}</p>
                <p className="hidden truncate text-xs text-slate-500 sm:block">{schoolName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden max-w-56 truncate text-sm font-medium text-slate-700 sm:inline">
                {userName}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:inline-flex md:hidden"
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
          {mobileMenuOpen && (
            <div className="border-t border-slate-100 bg-[#eadcf4] px-4 py-4 md:hidden">
              <nav aria-label={`${portalLabel} navigation`} className="space-y-1">
                {renderNavigation(true)}
              </nav>
              <button
                type="button"
                onClick={signOut}
                className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-violet-950/85 hover:bg-white/50"
              >
                <LogOut size={18} aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
          {signOutError && <p role="alert" className="px-6 pb-3 text-sm text-rose-700">{signOutError}</p>}
        </header>
        {children}
      </div>
    </div>
  );
}
