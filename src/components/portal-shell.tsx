"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CalendarDays, CircleHelp, GraduationCap, KeyRound, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { setSelectedAcademicYear } from "@/app/admin/academic-year-actions";
import { selectSchool } from "@/app/select-school/actions";
import { WorkspaceQuickSearch } from "@/components/workspace-quick-search";
import { ThemeToggle } from "@/components/theme-toggle";
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
  schoolAddress,
  schoolPhone,
  schoolEmail,
  userName,
  portalLabel,
  navigation,
  searchScope,
  academicYears,
  selectedAcademicYearId,
  schoolChoices,
  currentSchoolPublicId,
}: {
  children: ReactNode;
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  schoolEmail?: string | null;
  userName: string;
  portalLabel: string;
  navigation: PortalNavigationItem[];
  searchScope?: "teaching" | "student";
  academicYears?: { id: number; name: string }[];
  selectedAcademicYearId?: number | null;
  schoolChoices?: { schoolPublicId: string; schoolName: string; isPracticeWorkspace: boolean }[];
  currentSchoolPublicId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [activeAnchor, setActiveAnchor] = useState("");
  const logo = schoolLogoSource(schoolLogoUrl);
  const schoolMonogram = schoolName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "S";

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
    return <>
      {navigation.map(({ href, label, icon: Icon }) => {
      const target = navHref(href);
      const [targetPath, targetQuery] = href.split("?");
      const targetSection = new URLSearchParams(targetQuery ?? "").get("section");
      const active = href.startsWith("#")
        ? activeAnchor === href
        : pathname === targetPath &&
          (searchParams.get("section") ?? "overview") === (targetSection ?? "overview");
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
              ? "bg-white text-violet-800 shadow-sm"
              : "text-slate-700 hover:bg-white/80 hover:text-slate-950",
          )}
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </Link>
      );
      })}
      {!navigation.some((item) => item.href === "/account/security") && <Link
        href="/account/security"
        onClick={() => {
          setActiveAnchor("");
          if (mobile) setMobileMenuOpen(false);
        }}
        aria-current={pathname === "/account/security" ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
          pathname === "/account/security"
            ? "bg-white text-violet-800 shadow-sm"
            : "text-slate-700 hover:bg-white/80 hover:text-slate-950",
        )}
      >
        <KeyRound size={18} aria-hidden="true" />
        Account security
      </Link>}
      <Link
        href="/guide"
        onClick={() => {
          setActiveAnchor("");
          if (mobile) setMobileMenuOpen(false);
        }}
        aria-current={pathname === "/guide" ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
          pathname === "/guide"
            ? "bg-white text-violet-800 shadow-sm"
            : "text-slate-700 hover:bg-white/80 hover:text-slate-950",
        )}
      >
        <CircleHelp size={18} aria-hidden="true" />
        User guide
      </Link>
    </>;
  }

  return (
    <div className="portal-shell-root min-h-dvh bg-slate-50 text-slate-900 md:grid md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden h-dvh flex-col border-r border-slate-200 bg-slate-100 px-5 py-6 md:sticky md:top-0 md:flex">
        <Link href={navHref(navigation[0]?.href ?? "/")} className="mb-9 flex items-center gap-3 px-1">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-violet-800 shadow-sm">
            {logo
              ? <Image src={logo} unoptimized width={44} height={44} alt={`${schoolName} logo`} className="h-full w-full object-contain" />
              : <GraduationCap size={24} aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-950">{schoolName}</span>
            <span className="mt-0.5 block text-xs text-slate-600">{portalLabel}</span>
          </span>
        </Link>
        <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Workspace
        </p>
        <nav aria-label={`${portalLabel} navigation`} className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {renderNavigation()}
        </nav>
        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="truncate px-3 text-sm font-semibold text-slate-900">{userName}</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-3 inline-flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-white/80"
          >
            <LogOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="portal-shell-content min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white text-slate-950 print:hidden">
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white text-violet-800 md:hidden">
                {logo
                  ? <Image src={logo} unoptimized width={36} height={36} alt={`${schoolName} logo`} className="h-full w-full object-contain" />
                  : <GraduationCap size={20} aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-violet-800">{portalLabel}</p>
                <p className="hidden truncate text-xs text-slate-500 sm:block">{schoolName}</p>
              </div>
            </div>
            {searchScope && (
              <div className="hidden min-w-0 max-w-xl flex-1 sm:block">
                <WorkspaceQuickSearch scope={searchScope} instanceId="portal-search-desktop" />
              </div>
            )}
            <div className="flex items-center gap-3">
              {schoolChoices && schoolChoices.length > 1 && currentSchoolPublicId && (
                <form action={selectSchool} className="relative">
                  <label htmlFor="portal-school-workspace" className="sr-only">School workspace</label>
                  <select
                    id="portal-school-workspace"
                    name="schoolPublicId"
                    aria-label="School workspace"
                    title="Switch school workspace"
                    defaultValue={currentSchoolPublicId}
                    onChange={(event) => event.currentTarget.form?.requestSubmit()}
                    className="h-9 max-w-[34vw] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-violet-400 sm:max-w-52 sm:px-3 sm:text-sm"
                  >
                    {schoolChoices.map((choice) => (
                      <option key={choice.schoolPublicId} value={choice.schoolPublicId}>
                        {choice.isPracticeWorkspace ? `Practice · ${choice.schoolName}` : choice.schoolName}
                      </option>
                    ))}
                  </select>
                </form>
              )}
              {academicYears && (
                <form action={setSelectedAcademicYear} className="relative min-w-0">
                  <label htmlFor="portal-academic-year" className="sr-only">Academic year</label>
                  <select
                    key={selectedAcademicYearId ?? "no-year"}
                    id="portal-academic-year"
                    name="academicYearId"
                    aria-label="Academic year for year-based records"
                    title="Academic year for year-based records"
                    defaultValue={selectedAcademicYearId == null ? "" : String(selectedAcademicYearId)}
                    disabled={academicYears.length === 0}
                    onChange={(event) => event.currentTarget.form?.requestSubmit()}
                    className="h-9 w-32 max-w-[34vw] appearance-none rounded-lg border border-slate-200 bg-white px-2 pr-7 text-xs font-medium text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:text-slate-400 sm:w-40 sm:max-w-none sm:px-3 sm:text-sm"
                  >
                    {academicYears.map((year) => (
                      <option key={year.id} value={year.id}>{year.name}</option>
                    ))}
                    {academicYears.length === 0 && <option value="">No academic years</option>}
                  </select>
                  <CalendarDays
                    aria-hidden="true"
                    size={14}
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </form>
              )}
              <ThemeToggle />
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
          {searchScope && (
            <div className="px-4 pb-3 sm:hidden">
              <WorkspaceQuickSearch scope={searchScope} instanceId="portal-search-mobile" />
            </div>
          )}
          {mobileMenuOpen && (
            <div className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-slate-200 bg-white px-4 py-4 md:hidden">
              <nav aria-label={`${portalLabel} navigation`} className="space-y-1">
                {renderNavigation(true)}
              </nav>
              <button
                type="button"
                onClick={signOut}
                className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <LogOut size={18} aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
          {signOutError && <p role="alert" className="px-6 pb-3 text-sm text-rose-700">{signOutError}</p>}
        </header>
        <div className="admin-print-header" aria-label={`${schoolName} letterhead`}>
          <div className="admin-print-crest" aria-hidden="true">
            {logo
              ? <Image src={logo} unoptimized width={40} height={40} alt="" className="h-full w-full rounded-full bg-white object-contain" />
              : <span>{schoolMonogram}</span>}
          </div>
          <div className="admin-print-identity">
            <p className="admin-print-eyebrow">Official school record</p>
            <h1>{schoolName}</h1>
            <div className="admin-print-contact">
              {schoolAddress && <div>{schoolAddress}</div>}
              {[schoolPhone, schoolEmail].filter(Boolean).join("  •  ") && (
                <div>{[schoolPhone, schoolEmail].filter(Boolean).join("  •  ")}</div>
              )}
            </div>
          </div>
        </div>
        {children}
        <footer className="admin-print-footer">
          <span className="admin-print-footer-crest" aria-hidden="true">
            {logo
              ? <Image src={logo} unoptimized width={24} height={24} alt="" className="h-full w-full object-contain" />
              : schoolMonogram}
          </span>
          <span className="admin-print-footer-contact">
            <strong>{schoolName}</strong>
            <span>{[schoolAddress, schoolPhone, schoolEmail].filter(Boolean).join("  •  ") || "School contact details not configured"}</span>
          </span>
          <span className="admin-print-footer-note">Official school record<br />Handle confidentially</span>
        </footer>
      </div>
    </div>
  );
}
