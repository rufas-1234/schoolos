"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  ChevronDown,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  School,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { academicSections } from "@/lib/academic-sections";
import { studentSections } from "@/lib/student-sections";
import { cn } from "@/lib/utils";
import { WorkspaceQuickSearch } from "@/components/workspace-quick-search";

type NavigationChild = {
  id: string;
  label: string;
  href?: string;
  matchPath?: string;
  matchQuery?: { key: string; value: string | null };
  permission?: string;
  permissionAlternatives?: readonly string[];
};

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: string;
  permissionAlternatives?: readonly string[];
  children?: readonly NavigationChild[];
};

const navigation: NavigationItem[] = [
  { href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/portal/teacher", label: "Teacher Portal", icon: GraduationCap, permission: "results.enter" },
  {
    href: "/admin/academics",
    label: "Academics",
    icon: CalendarDays,
    permission: "school.settings.manage",
    children: academicSections.map((section) => ({
      id: section.id,
      label: section.label,
      href: `/admin/academics?section=${section.id}`,
      matchQuery: { key: "section", value: section.id },
    })),
  },
  {
    href: "/admin/students",
    label: "Student Info",
    icon: Users,
    permission: "students.view",
    children: studentSections,
  },
  {
    href: "/admin/examinations",
    label: "Examinations",
    icon: BookOpen,
    permission: "examinations.create",
    permissionAlternatives: ["results.enter", "results.publish"],
    children: [
      { id: "types", label: "Exam Type", href: "/admin/examinations?section=types", permission: "examinations.create", permissionAlternatives: ["results.enter", "results.publish"], matchQuery: { key: "section", value: "types" } },
      { id: "setup", label: "Exam Setup", href: "/admin/examinations?section=setup", permission: "examinations.create", permissionAlternatives: ["results.enter", "results.publish"], matchQuery: { key: "section", value: "setup" } },
      { id: "schedule", label: "Exam Schedule", href: "/admin/examinations?section=schedule", permission: "examinations.create", permissionAlternatives: ["results.enter", "results.publish"], matchQuery: { key: "section", value: "schedule" } },
      { id: "attendance", label: "Exam Attendance", href: "/admin/examinations?section=attendance", permission: "examinations.create", permissionAlternatives: ["results.enter", "results.publish"], matchQuery: { key: "section", value: "attendance" } },
      { id: "marks-register", label: "Marks Register", href: "/admin/examinations?section=marks", permission: "examinations.create", permissionAlternatives: ["results.enter", "results.publish"], matchQuery: { key: "section", value: "marks" } },
      { id: "marks-grade", label: "Marks Grade", href: "/admin/examinations?section=grades", permission: "examinations.create", permissionAlternatives: ["results.enter", "results.publish"], matchQuery: { key: "section", value: "grades" } },
      { id: "send-marks-sms", label: "Send Marks By SMS", href: "/admin/examinations?section=sms", permission: "examinations.create", permissionAlternatives: ["results.enter", "results.publish"], matchQuery: { key: "section", value: "sms" } },
      { id: "exam-reports", label: "Exams Reports", href: "/admin/examinations/report-center/exam-routine" },
    ],
  },
  {
    href: "/admin/hr",
    label: "Human resources",
    icon: BriefcaseBusiness,
    permission: "school.settings.manage",
    permissionAlternatives: ["staff.manage", "roles.manage"],
    children: [
      { id: "overview", label: "HR overview", href: "/admin/hr", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "departments", label: "Departments", href: "/admin/hr/departments", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "designations", label: "Designations", href: "/admin/hr/designations", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "staff", label: "Staff directory", href: "/admin/staff", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "attendance", label: "Staff attendance records", href: "/admin/hr/attendance", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "leave", label: "Leave management", href: "/admin/hr/leave", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "payroll", label: "Payroll records", href: "/admin/hr/payroll", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "reports", label: "Staff attendance reports", href: "/admin/hr/reports", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "user-roles", label: "User roles", href: "/admin/settings/roles", permission: "roles.manage" },
      { id: "settings", label: "HR settings", href: "/admin/hr/settings", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
    ],
  },
  {
    href: "/admin/fees/collection",
    label: "Finances",
    icon: CircleDollarSign,
    permission: "fees.manage",
    permissionAlternatives: ["payments.record"],
    children: [
      { id: "fee-setup", label: "Fee setup", href: "/admin/fees", permission: "fees.manage" },
      {
        id: "fee-collection",
        label: "Fee collection",
        href: "/admin/fees/collection",
        permission: "payments.record",
        permissionAlternatives: ["fees.manage"],
      },
      {
        id: "fee-reports",
        label: "Fee reports",
        href: "/admin/fees/reports",
        permission: "payments.record",
        permissionAlternatives: ["fees.manage"],
      },
    ],
  },
  {
    href: "/admin/settings",
    label: "School profile",
    icon: School,
    permission: "school.settings.manage",
  },
];

export function AdminShell({
  children,
  schoolName,
  schoolEmail,
  schoolPhone,
  schoolAddress,
  userName,
  roleNames,
  permissions,
}: {
  children: ReactNode;
  schoolName: string;
  schoolEmail: string | null;
  schoolPhone: string | null;
  schoolAddress: string | null;
  userName: string;
  roleNames: string[];
  permissions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const [academicsOpen, setAcademicsOpen] = useState(() =>
    pathname.startsWith("/admin/academics"),
  );
  const [studentInfoOpen, setStudentInfoOpen] = useState(() =>
    pathname.startsWith("/admin/students"),
  );
  const [humanResourcesOpen, setHumanResourcesOpen] = useState(() =>
    pathname.startsWith("/admin/hr") || pathname === "/admin/settings/roles",
  );
  const [financesOpen, setFinancesOpen] = useState(() =>
    pathname.startsWith("/admin/fees"),
  );
  const [examinationsOpen, setExaminationsOpen] = useState(() =>
    pathname.startsWith("/admin/examinations"),
  );
  const router = useRouter();
  const visibleNavigation = navigation.filter((item) =>
    permissions.includes(item.permission) ||
    (item.permissionAlternatives?.some((permission) => permissions.includes(permission)) ?? false)
  );
  const roleLabel = roleNames.length === 1 ? roleNames[0] : "Multiple roles";
  const homeHref = permissions.includes("dashboard.view")
    ? "/admin/dashboard"
    : permissions.includes("roles.manage")
        ? "/admin/settings/roles"
      : permissions.includes("school.settings.manage")
        ? "/admin/settings"
      : permissions.includes("examinations.create") || permissions.includes("results.publish")
        ? "/admin/examinations"
      : permissions.includes("results.enter")
        ? "/portal/teacher"
      : permissions.includes("staff.manage")
        ? "/admin/hr"
      : permissions.includes("fees.manage") || permissions.includes("payments.record")
        ? "/admin/fees/collection"
      : permissions.includes("students.view")
        ? "/admin/students"
        : "/unauthorized";
  const schoolMonogram =
    schoolName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toLocaleUpperCase() || "S";
  const activeSection = academicSections.find(
    (section) => section.id === searchParams.get("section"),
  );
  const activeStudentSection = studentSections.find((section) => {
    if (!("href" in section) || !section.href) return false;
    const sectionPath = ("matchPath" in section ? section.matchPath : undefined)
      ?? section.href.split("?")[0];
    if (sectionPath !== pathname) return false;
    return !("matchQuery" in section) || !section.matchQuery ||
      searchParams.get(section.matchQuery.key) === section.matchQuery.value;
  });
  const activeHrSection = navigation
    .find((item) => item.href === "/admin/hr")
    ?.children?.find((section) => section.href === pathname);
  const activeFinanceSection = navigation
    .find((item) => item.label === "Finances")
    ?.children?.find((section) => section.href === pathname);
  const pageLabel = pathname.startsWith("/admin/academics")
    ? activeSection?.label ?? "Academics"
    : pathname.startsWith("/admin/students")
      ? activeStudentSection?.label ?? "Student Info"
      : pathname.startsWith("/admin/hr")
        ? activeHrSection?.label ?? "Human resources"
        : pathname === "/admin/settings/roles"
          ? activeHrSection?.label ?? "User roles"
        : pathname.startsWith("/admin/fees")
          ? activeFinanceSection?.label ?? "Finances"
      : visibleNavigation.find(
        (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
      )?.label ?? "Workspace";

  useEffect(() => {
    document
      .querySelectorAll<HTMLAnchorElement>(".admin-sidebar-nav a[aria-current='page']")
      .forEach((link) => link.scrollIntoView({ block: "nearest" }));
  }, [open, pathname, routeQuery]);

  async function signOut() {
    setSignOutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSignOutError(result.error.message ?? "Sign out failed. Please try again.");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setSignOutError("Sign out failed. Please try again.");
    }
  }

  const sidebar = (
    <aside className="print:hidden flex h-full w-[260px] flex-col overflow-hidden border-r border-slate-100 bg-white px-5 py-6">
      <Link href={homeHref} className="mb-9 flex items-center gap-3 px-1">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-700 text-white shadow-lg shadow-violet-200">
          <GraduationCap size={24} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-slate-900">{schoolName}</span>
          <span className="mt-0.5 block text-xs text-slate-400">School workspace</span>
        </span>
      </Link>

      <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
        Workspace
      </p>
      <nav aria-label="Main navigation" className="admin-sidebar-nav min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
        {visibleNavigation.map(({ href, label, icon: Icon, children }) => {
          const nestedNavigationActive = visibleNavigation.some(
            (item) =>
              item.href.startsWith(`${href}/`) &&
              (pathname === item.href || pathname.startsWith(`${item.href}/`)),
          );
          const active =
            pathname === href ||
            (pathname.startsWith(`${href}/`) && !nestedNavigationActive) ||
            (href === "/admin/fees/collection" && pathname.startsWith("/admin/fees")) ||
            (href === "/admin/hr" && pathname === "/admin/settings/roles");
          if (children) {
            const visibleSections = children.filter(
              (section) =>
                (!section.permission || permissions.includes(section.permission)) ||
                (section.permissionAlternatives?.some((permission) => permissions.includes(permission)) ?? false),
            );
            const isStudentInfo = href === "/admin/students";
            const isHumanResources = href === "/admin/hr";
            const isFinances = href === "/admin/fees/collection";
            const isExaminations = href === "/admin/examinations";
            const sectionOpen = isStudentInfo
              ? studentInfoOpen
              : isHumanResources
                ? humanResourcesOpen
                : isFinances
                  ? financesOpen
                  : isExaminations
                    ? examinationsOpen
                  : academicsOpen;
            const setSectionOpen = isStudentInfo
              ? setStudentInfoOpen
              : isHumanResources
                ? setHumanResourcesOpen
                : isFinances
                  ? setFinancesOpen
                  : isExaminations
                    ? setExaminationsOpen
                  : setAcademicsOpen;
            const activeChild = visibleSections.find((section) => {
              if (!section.href) return false;
              const sectionPath = section.matchPath ?? section.href.split("?")[0];
              return (
                sectionPath === pathname &&
                (!section.matchQuery ||
                  searchParams.get(section.matchQuery.key) === section.matchQuery.value)
              );
            });
            return (
              <div key={href}>
                <button
                  type="button"
                  aria-expanded={sectionOpen}
                  onClick={() => {
                    if (active) {
                      setSectionOpen((value) => !value);
                    } else {
                      setSectionOpen(true);
                      router.push(href);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition",
                    active
                      ? "bg-violet-50 text-violet-800"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                  )}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                  {label}
                  <ChevronDown
                    size={16}
                    className={cn("ml-auto transition-transform", sectionOpen && "rotate-180")}
                  />
                </button>
                {sectionOpen && (
                  <div className="ml-5 mt-1 space-y-1 border-l border-slate-100 pl-3">
                    {visibleSections.map((section) => {
                      if (!section.href) {
                        return (
                          <span
                            key={section.id}
                            aria-disabled="true"
                            title={`${section.label} is not available yet`}
                            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400"
                          >
                            {section.label}
                            <span className="text-[10px] font-semibold uppercase tracking-wide">
                              Soon
                            </span>
                          </span>
                        );
                      }
                      const sectionActive = activeChild?.id === section.id;
                      return (
                        <Link
                          key={section.id}
                          href={section.href}
                          onClick={() => setOpen(false)}
                          aria-current={sectionActive ? "page" : undefined}
                          className={cn(
                            "block rounded-lg px-3 py-2 text-sm transition",
                            sectionActive
                              ? "bg-violet-50 font-semibold text-violet-800"
                              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                          )}
                        >
                          {section.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-violet-50 text-violet-800"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-600" />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-violet-700 shadow-sm">
          <ShieldCheck size={18} />
        </div>
        <p className="text-sm font-semibold text-slate-800">School administration</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Manage academics, people, and school settings from one workspace.
        </p>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f7f7fa]">
      <header className="admin-print-header" aria-label={`${schoolName} letterhead`}>
        <div className="admin-print-crest" aria-hidden="true">
          <span>{schoolMonogram}</span>
        </div>
        <div className="admin-print-identity">
          <p className="admin-print-eyebrow">Official school record</p>
          <h1>{schoolName}</h1>
          <div className="admin-print-contact">
            <div>Address: {schoolAddress || "Not configured"}</div>
            <div>
              {[
                schoolPhone ? `Phone: ${schoolPhone}` : "Phone: Not configured",
                schoolEmail ? `Email: ${schoolEmail}` : "Email: Not configured",
              ].join("  •  ")}
            </div>
          </div>
        </div>
        <div className="admin-print-seal" aria-hidden="true">SCHOOL</div>
      </header>
      <div className="print:hidden fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</div>
      {open && (
        <div className="print:hidden fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative h-full w-[280px]">{sidebar}</div>
        </div>
      )}

      <div className="admin-shell-content lg:pl-[260px]">
        <header className="print:hidden sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-100 bg-white/90 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div className="hidden items-center gap-2 text-sm text-slate-400 sm:flex">
              <BookOpen size={16} />
              <span>Administration</span>
              <span>/</span>
              <span className="font-semibold text-slate-700">{pageLabel}</span>
            </div>
            <span className="text-sm font-semibold text-slate-800 sm:hidden">SchoolOS</span>
          </div>

          <WorkspaceQuickSearch />

          <div className="flex items-center gap-2">
            <div className="mx-1 hidden h-8 w-px bg-slate-100 sm:block" />
            <div className="relative">
              <button
                className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-slate-50"
                onClick={() => setMenuOpen((value) => !value)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-sm font-bold text-amber-800">
                  {userName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-36 text-left sm:block">
                  <span className="block truncate text-sm font-semibold text-slate-800">{userName}</span>
                  <span className="block truncate text-xs text-slate-400">{roleLabel}</span>
                </span>
                <ChevronDown size={16} className="hidden text-slate-400 sm:block" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 z-30 w-48 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl">
                  {permissions.includes("school.settings.manage") && (
                    <Link
                      href="/admin/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      <Settings size={16} />
                      School profile
                    </Link>
                  )}
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {signOutError && (
          <p role="alert" className="print:hidden border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm text-rose-700 md:px-8">
            {signOutError}
          </p>
        )}
        <main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-9">{children}</main>
      </div>
      <footer className="admin-print-footer">
        <span>{schoolName} <span aria-hidden="true">•</span> Official school record</span>
        <span>Handle student information confidentially</span>
      </footer>
      {open && (
        <button
          className="print:hidden fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-600 shadow-lg lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
