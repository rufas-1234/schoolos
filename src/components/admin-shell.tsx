"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  BookMarked,
  BedDouble,
  BriefcaseBusiness,
  CalendarDays,
  CircleHelp,
  CircleDollarSign,
  ChartNoAxesCombined,
  ChevronDown,
  GraduationCap,
  LayoutDashboard,
  KeyRound,
  LogOut,
  Menu,
  PackageOpen,
  PanelRight,
  Search,
  School,
  Settings,
  Users,
  UserRoundCog,
  X,
  type LucideIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { academicSections } from "@/lib/academic-sections";
import { studentSections } from "@/lib/student-sections";
import { cn } from "@/lib/utils";
import { WorkspaceQuickSearch } from "@/components/workspace-quick-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { schoolLogoSource } from "@/lib/school-logo";
import { selectSchool } from "@/app/select-school/actions";

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
  {
    href: "/admin/academics",
    label: "Academics",
    icon: CalendarDays,
    permission: "academics.manage",
    permissionAlternatives: ["school.settings.manage"],
    children: [
      ...academicSections.filter((section) => section.id !== "teachers").map((section) => ({
        id: section.id,
        label: section.label,
        href: `/admin/academics?section=${section.id}`,
        matchQuery: { key: "section", value: section.id },
      })),
    ],
  },
  {
    href: "/admin/students",
    label: "Student Info",
    icon: Users,
    permission: "students.view",
    permissionAlternatives: ["students.update"],
    children: [
      ...studentSections,
      {
        id: "attendance-reports",
        label: "Student attendance reports",
        href: "/admin/academics/attendance-reports",
        matchPath: "/admin/academics/attendance-reports",
        permission: "students.view",
        permissionAlternatives: ["students.update", "academics.manage", "school.settings.manage"],
      },
    ],
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
      { id: "report-signatures", label: "Report Signatures", href: "/admin/examinations/signatures", permission: "examinations.create", permissionAlternatives: ["results.publish", "results.enter"] },
      { id: "marks-register", label: "Marks Register", href: "/admin/examinations?section=marks", permission: "examinations.create", permissionAlternatives: ["results.enter", "results.publish"], matchQuery: { key: "section", value: "marks" } },
      { id: "marks-grade", label: "Marks Grade", href: "/admin/examinations?section=grades", permission: "examinations.create", permissionAlternatives: ["results.enter", "results.publish"], matchQuery: { key: "section", value: "grades" } },
      { id: "send-marks-sms", label: "Send Marks By SMS", href: "/admin/examinations?section=sms", permission: "examinations.create", permissionAlternatives: ["results.enter", "results.publish"], matchQuery: { key: "section", value: "sms" } },
      { id: "exam-reports", label: "Exams Reports", href: "/admin/examinations/report-center/exam-routine" },
      { id: "exam-analytics", label: "Exam Analytics", href: "/admin/exam-analytics", matchPath: "/admin/exam-analytics", permission: "examinations.create", permissionAlternatives: ["results.publish"] },
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
      { id: "staff-applications", label: "Staff applications", href: "/admin/staff/applications", matchPath: "/admin/staff/applications", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "attendance", label: "Staff attendance records", href: "/admin/hr/attendance", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "leave", label: "Leave management", href: "/admin/hr/leave", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "payroll", label: "Payroll records", href: "/admin/hr/payroll", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "reports", label: "Staff attendance reports", href: "/admin/hr/reports", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
      { id: "settings", label: "HR settings", href: "/admin/hr/settings", permission: "school.settings.manage", permissionAlternatives: ["staff.manage"] },
    ],
  },
  {
    href: "/portal/finance",
    label: "Finance overview",
    icon: ChartNoAxesCombined,
    permission: "fees.manage",
    permissionAlternatives: ["payments.record", "accounts.manage", "inventory.manage"],
  },
  {
    href: "/admin/fees/collection",
    label: "Fees",
    icon: CircleDollarSign,
    permission: "fees.manage",
    permissionAlternatives: ["payments.record"],
    children: [
      { id: "fee-setup", label: "Fee setup", href: "/admin/fees", matchQuery: { key: "section", value: null }, permission: "fees.manage" },
      { id: "fee-discounts", label: "Scholarships & discounts", href: "/admin/fees?section=discounts", matchPath: "/admin/fees", matchQuery: { key: "section", value: "discounts" }, permission: "fees.manage" },
      { id: "fee-structure-create", label: "Set up fee structure", href: "/admin/fees?section=structure", matchPath: "/admin/fees", matchQuery: { key: "section", value: "structure" }, permission: "fees.manage" },
      { id: "fee-invoices", label: "Generate student invoices", href: "/admin/fees?section=invoices", matchPath: "/admin/fees", matchQuery: { key: "section", value: "invoices" }, permission: "fees.manage" },
      {
        id: "fee-collection",
        label: "Fee collection",
        href: "/admin/fees/collection",
        permission: "payments.record",
        permissionAlternatives: ["fees.manage"],
      },
      {
        id: "fee-carry-forward",
        label: "Carry-forward fees",
        href: "/admin/fees/collection/carry-forward",
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
    href: "/admin/library",
    label: "Library",
    icon: BookMarked,
    permission: "library.manage",
    children: [
      { id: "add-book", label: "Add Book", href: "/admin/library?section=add-book", matchQuery: { key: "section", value: "add-book" } },
      { id: "books", label: "Book List", href: "/admin/library?section=books", matchQuery: { key: "section", value: "books" } },
      { id: "categories", label: "Book Categories", href: "/admin/library?section=categories", matchQuery: { key: "section", value: "categories" } },
      { id: "members", label: "Add Member", href: "/admin/library?section=members", matchQuery: { key: "section", value: "members" } },
      { id: "issue", label: "Issue / Return Book", href: "/admin/library?section=issue", matchQuery: { key: "section", value: "issue" } },
      { id: "issued", label: "All Issued Books", href: "/admin/library?section=issued", matchQuery: { key: "section", value: "issued" } },
      { id: "subjects", label: "Subject", href: "/admin/library?section=subjects", matchQuery: { key: "section", value: "subjects" } },
    ],
  },
  {
    href: "/admin/dormitories",
    label: "Dormitories",
    icon: BedDouble,
    permission: "dormitories.manage",
    children: [
      { id: "overview", label: "Dormitory overview", href: "/admin/dormitories?section=overview", matchQuery: { key: "section", value: "overview" } },
      { id: "dormitories", label: "Dormitories", href: "/admin/dormitories?section=dormitories", matchQuery: { key: "section", value: "dormitories" } },
      { id: "rooms", label: "Rooms & beds", href: "/admin/dormitories?section=rooms", matchQuery: { key: "section", value: "rooms" } },
      { id: "residents", label: "Room assignments", href: "/admin/dormitories?section=residents", matchQuery: { key: "section", value: "residents" } },
      { id: "reports", label: "Reports", href: "/admin/dormitories/reports", matchPath: "/admin/dormitories/reports" },
    ],
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    icon: PackageOpen,
    permission: "inventory.manage",
    permissionAlternatives: ["accounts.manage"],
    children: [
      { id: "inventory-setup", label: "Inventory setup", href: "/admin/inventory?view=setup", matchPath: "/admin/inventory", matchQuery: { key: "view", value: "setup" }, permission: "inventory.manage" },
      { id: "stock-register", label: "Stock register", href: "/admin/inventory?view=register", matchPath: "/admin/inventory", matchQuery: { key: "view", value: "register" }, permission: "inventory.manage" },
      { id: "stock-movements", label: "Stock movement & history", href: "/admin/inventory?view=movements", matchPath: "/admin/inventory", matchQuery: { key: "view", value: "movements" }, permission: "inventory.manage" },
      { id: "accounts-chart", label: "Chart of accounts", href: "/admin/accounts?section=chart", matchPath: "/admin/accounts", matchQuery: { key: "section", value: "chart" }, permission: "accounts.manage" },
      { id: "accounts-profit", label: "Profit & loss", href: "/admin/accounts?section=profit", matchPath: "/admin/accounts", matchQuery: { key: "section", value: "profit" }, permission: "accounts.manage" },
      { id: "accounts-bank", label: "Bank accounts", href: "/admin/accounts?section=bank", matchPath: "/admin/accounts", matchQuery: { key: "section", value: "bank" }, permission: "accounts.manage" },
      { id: "accounts-transfers", label: "Fund transfers", href: "/admin/accounts?section=transfers", matchPath: "/admin/accounts", matchQuery: { key: "section", value: "transfers" }, permission: "accounts.manage" },
      { id: "assets", label: "Assets", href: "/admin/inventory?view=assets", matchPath: "/admin/inventory", matchQuery: { key: "view", value: "assets" }, permission: "inventory.manage" },
      { id: "asset-maintenance", label: "Asset maintenance", href: "/admin/inventory?view=maintenance", matchPath: "/admin/inventory", matchQuery: { key: "view", value: "maintenance" }, permission: "inventory.manage" },
      { id: "accounts-income", label: "Income", href: "/admin/accounts?section=income", matchPath: "/admin/accounts", matchQuery: { key: "section", value: "income" }, permission: "accounts.manage" },
      { id: "expenses", label: "Expenses", href: "/admin/accounts?section=expenses", matchPath: "/admin/accounts", matchQuery: { key: "section", value: "expenses" }, permission: "accounts.manage" },
      { id: "inventory-reports", label: "Reports", href: "/admin/inventory/reports", matchPath: "/admin/inventory/reports", permission: "inventory.manage", permissionAlternatives: ["accounts.manage"] },
    ],
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: UserRoundCog,
    permission: "roles.manage",
    children: [
      { id: "user-list", label: "User list", href: "/admin/users" },
      { id: "create-role", label: "Create role", href: "/admin/users/roles?section=create-role", matchPath: "/admin/users/roles", matchQuery: { key: "section", value: "create-role" } },
      { id: "school-roles", label: "School roles", href: "/admin/users/roles?section=school-roles", matchPath: "/admin/users/roles", matchQuery: { key: "section", value: "school-roles" } },
      { id: "caretaker-roles", label: "Caretaker roles & accounts", href: "/admin/users/roles?section=caretaker-roles", matchPath: "/admin/users/roles", matchQuery: { key: "section", value: "caretaker-roles" } },
      { id: "create-account", label: "Create account", href: "/admin/users/roles?section=create-account", matchPath: "/admin/users/roles", matchQuery: { key: "section", value: "create-account" } },
      { id: "individual-access", label: "Individual access", href: "/admin/users/roles?section=individual-access", matchPath: "/admin/users/roles", matchQuery: { key: "section", value: "individual-access" } },
    ],
  },
  {
    href: "/admin/system/settings",
    label: "System",
    icon: Settings,
    permission: "school.settings.manage",
    children: [
      { id: "user-logs", label: "User Logs", href: "/admin/system/user-logs" },
      { id: "system-settings", label: "System Settings", href: "/admin/system/settings" },
    ],
  },
  {
    href: "/admin/settings",
    label: "School profile",
    icon: School,
    permission: "school.settings.manage",
  },
];

const navigationGroups = [
  { label: "Home", labels: ["Overview"] },
  { label: "Teaching & learning", labels: ["Academics", "Student Info", "Examinations"] },
  { label: "People", labels: ["Human resources", "Users"] },
  { label: "School operations", labels: ["Finance overview", "Fees", "Inventory", "Library", "Dormitories"] },
  { label: "Configuration", labels: ["System", "School profile"] },
];

export function AdminShell({
  children,
  schoolName,
  schoolLogoUrl,
  schoolEmail,
  schoolPhone,
  schoolAddress,
  userName,
  roleNames,
  permissions,
  activeSchoolPublicId,
  schoolChoices,
  multiSchoolEnabled,
  isPlatformAdmin,
}: {
  children: ReactNode;
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolEmail: string | null;
  schoolPhone: string | null;
  schoolAddress: string | null;
  userName: string;
  roleNames: string[];
  permissions: string[];
  activeSchoolPublicId: string;
  schoolChoices: { schoolPublicId: string; schoolName: string }[];
  multiSchoolEnabled: boolean;
  isPlatformAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] = useState(false);
  const [desktopRightSidebarExpanded, setDesktopRightSidebarExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [rightSidebarQuery, setRightSidebarQuery] = useState("");
  const [leftSidebarQuery, setLeftSidebarQuery] = useState("");
  const leftSidebarSearchRef = useRef<HTMLInputElement>(null);
  const desktopSidebarRef = useRef<HTMLDivElement>(null);
  const desktopRightSidebarRef = useRef<HTMLDivElement>(null);
  const mobileNavigationRef = useRef<HTMLDivElement>(null);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const closeNavigationRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const [academicsOpen, setAcademicsOpen] = useState(() =>
    pathname.startsWith("/admin/academics"),
  );
  const [studentInfoOpen, setStudentInfoOpen] = useState(() =>
    pathname.startsWith("/admin/students") || pathname.startsWith("/admin/admissions"),
  );
  const [usersOpen, setUsersOpen] = useState(() =>
    pathname.startsWith("/admin/users") || pathname === "/admin/settings/roles",
  );
  const [humanResourcesOpen, setHumanResourcesOpen] = useState(() =>
    pathname.startsWith("/admin/hr") || pathname === "/admin/settings/roles",
  );
  const [inventoryOpen, setInventoryOpen] = useState(() =>
    pathname.startsWith("/admin/inventory") || pathname.startsWith("/admin/accounts") ||
    permissions.some((permission) => ["inventory.manage", "accounts.manage"].includes(permission)),
  );
  const [feesOpen, setFeesOpen] = useState(() =>
    pathname.startsWith("/admin/fees") ||
    permissions.some((permission) => ["fees.manage", "payments.record"].includes(permission)),
  );
  const [examinationsOpen, setExaminationsOpen] = useState(() =>
    pathname.startsWith("/admin/examinations") || pathname === "/admin/exam-analytics",
  );
  const [libraryOpen, setLibraryOpen] = useState(() => pathname.startsWith("/admin/library"));
  const [dormitoriesOpen, setDormitoriesOpen] = useState(() => pathname.startsWith("/admin/dormitories"));
  const [systemOpen, setSystemOpen] = useState(() => pathname.startsWith("/admin/system"));
  const router = useRouter();
  useEffect(() => {
    function focusSidebarSearch(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (window.matchMedia("(max-width: 1023px)").matches && !open) {
          setOpen(true);
          window.setTimeout(() => leftSidebarSearchRef.current?.focus(), 50);
        } else if (!desktopSidebarExpanded) {
          setDesktopSidebarExpanded(true);
          window.setTimeout(() => leftSidebarSearchRef.current?.focus(), 50);
        } else {
          leftSidebarSearchRef.current?.focus();
        }
      }
    }
    document.addEventListener("keydown", focusSidebarSearch);
    return () => document.removeEventListener("keydown", focusSidebarSearch);
  }, [desktopSidebarExpanded, open]);
  const visibleNavigation = navigation
    .filter((item) =>
      permissions.includes(item.permission) ||
      (item.permissionAlternatives?.some((permission) => permissions.includes(permission)) ?? false)
    )
    .map((item) => item.label === "Inventory" && !permissions.includes("inventory.manage")
      ? { ...item, href: "/admin/accounts?section=profit" }
      : item);
  const rightSidebarItems = visibleNavigation.map((item) => ({
      ...item,
      children: item.children?.filter((child) =>
        (!child.permission || permissions.includes(child.permission)) ||
        (child.permissionAlternatives?.some((permission) => permissions.includes(permission)) ?? false),
      ).map((child) => child.id === "inventory-reports" && !permissions.includes("inventory.manage")
        ? { ...child, href: "/admin/accounts?section=reports" }
        : child),
    }));
  const roleLabel = roleNames.length === 1 ? roleNames[0] : "Multiple roles";
  const homeHref = permissions.includes("dashboard.view")
    ? "/admin/dashboard"
    : permissions.includes("roles.manage")
        ? "/admin/users"
      : permissions.includes("school.settings.manage")
        ? "/admin/settings"
      : permissions.includes("results.enter")
        ? "/portal/teacher"
      : permissions.includes("examinations.create") || permissions.includes("results.publish")
        ? "/admin/examinations"
      : permissions.includes("staff.manage")
        ? "/admin/hr"
      : permissions.includes("accounts.manage") || permissions.includes("fees.manage") || permissions.includes("payments.record") || permissions.includes("inventory.manage")
        ? "/portal/finance"
      : permissions.includes("dormitories.manage")
        ? "/portal/dormitories"
      : permissions.includes("library.manage")
        ? "/portal/library"
      : permissions.includes("inventory.manage")
        ? "/admin/inventory"
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
  const schoolLogo = schoolLogoSource(schoolLogoUrl);
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
    ?.children?.find((section) =>
      (section.matchPath ?? section.href?.split("?")[0]) === pathname,
    );
  const activeUserSection = navigation
    .find((item) => item.href === "/admin/users")
    ?.children?.find((section) => {
      const sectionPath = section.matchPath ?? section.href?.split("?")[0];
      return sectionPath === pathname &&
        (!section.matchQuery ||
          searchParams.get(section.matchQuery.key) === section.matchQuery.value);
    });
  const activeInventorySection = navigation
    .find((item) => item.label === "Inventory")
    ?.children?.find((section) => {
      const sectionPath = section.matchPath ?? section.href?.split("?")[0];
      const queryMatches = !section.matchQuery ||
        searchParams.get(section.matchQuery.key) === section.matchQuery.value ||
        (section.id === "accounts-profit" && searchParams.get("section") === null) ||
        (section.id === "assets" && searchParams.get("section") === "assets") ||
        (section.id === "stock-register" && searchParams.get("view") === null);
      return sectionPath === pathname && queryMatches;
    });
  const activeFeesSection = navigation
    .find((item) => item.label === "Fees")
    ?.children?.find((section) => {
      const sectionPath = section.matchPath ?? section.href?.split("?")[0];
      return sectionPath === pathname &&
        ((section.id === "fee-structure-create" && searchParams.get("section") === "structures") ||
          !section.matchQuery ||
          searchParams.get(section.matchQuery.key) === section.matchQuery.value);
    });
  const activeLibrarySection = navigation
    .find((item) => item.label === "Library")
    ?.children?.find((section) => section.matchQuery && searchParams.get(section.matchQuery.key) === section.matchQuery.value);
  const activeDormitorySection = navigation
    .find((item) => item.href === "/admin/dormitories")
    ?.children?.find((section) => section.matchQuery && searchParams.get(section.matchQuery.key) === section.matchQuery.value);
  const pageLabel = pathname.startsWith("/admin/academics")
    ? pathname.startsWith("/admin/academics/attendance-reports")
      ? "Student attendance reports"
      : activeSection?.label ?? "Academics"
    : pathname.startsWith("/admin/system")
      ? pathname.endsWith("/user-logs") ? "User Logs" : "System Settings"
    : pathname.startsWith("/admin/students")
      ? activeStudentSection?.label ?? "Student Info"
      : pathname.startsWith("/admin/staff")
        ? pathname.startsWith("/admin/staff/applications") ? "Staff applications" : "Staff directory"
      : pathname.startsWith("/admin/hr")
        ? activeHrSection?.label ?? "Human resources"
        : pathname.startsWith("/admin/users") || pathname === "/admin/settings/roles"
          ? activeUserSection?.label ?? "Users"
        : pathname.startsWith("/admin/accounts") || pathname.startsWith("/admin/inventory")
          ? pathname.startsWith("/admin/accounts") && searchParams.get("section") === "reports"
            ? "Reports"
            : activeInventorySection?.label ?? "Inventory"
        : pathname.startsWith("/admin/fees")
          ? activeFeesSection?.label ?? "Fees"
        : pathname.startsWith("/admin/library")
          ? activeLibrarySection?.label ?? "Library"
        : pathname === "/portal/finance"
          ? "Finance overview"
        : pathname.startsWith("/admin/dormitories")
          ? activeDormitorySection?.label ?? "Dormitories"
        : pathname === "/admin/account-security"
          ? "Account security"
        : pathname === "/admin/exam-analytics"
          ? "Exam Analytics"
      : visibleNavigation.find(
        (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
      )?.label ?? "Workspace";

  useEffect(() => {
    document
      .querySelectorAll<HTMLAnchorElement>(".admin-sidebar-nav a[aria-current='page']")
      .forEach((link) => link.scrollIntoView({ block: "nearest" }));
  }, [open, pathname, routeQuery]);

  useEffect(() => {
    if (!open) return;

    const navigationTrigger = navigationTriggerRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeNavigationRef.current?.focus();

    function handleNavigationKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = mobileNavigationRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]):not([data-drawer-backdrop])",
      );
      if (!focusableElements?.length) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleNavigationKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleNavigationKeyDown);
      navigationTrigger?.focus();
    };
  }, [open]);

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

  const sidebar = (compact = false) => (
    <aside className={cn(
      "admin-shell-sidebar print:hidden flex h-full flex-col overflow-hidden border-r border-slate-200 bg-white py-5 transition-[padding] duration-200 motion-reduce:transition-none",
      compact ? "w-[68px] items-center px-2" : "w-[260px] px-4",
    )}>
      <Link href={homeHref} aria-label={compact ? `${schoolName} home` : undefined} title={compact ? schoolName : undefined} className={cn("mb-5 flex items-center gap-3 px-1", compact && "justify-center")}>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f38020] text-white shadow-sm">
          {schoolLogo
            ? <Image src={schoolLogo} unoptimized width={40} height={40} alt="" className="h-full w-full rounded-xl bg-white object-contain" />
            : <GraduationCap size={24} />}
        </span>
        <span className={cn("min-w-0", compact && "hidden")}>
          <span className="block truncate text-sm font-semibold text-slate-900">{schoolName}</span>
          <span className="mt-0.5 block text-xs text-slate-500">School workspace</span>
        </span>
      </Link>

      {compact ? (
        <button
          type="button"
          title="Search navigation"
          aria-label="Expand navigation and search"
          onClick={() => {
            setDesktopSidebarExpanded(true);
            window.setTimeout(() => leftSidebarSearchRef.current?.focus(), 40);
          }}
          className="mb-3 flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <Search aria-hidden="true" size={17} />
        </button>
      ) : <label className="relative mb-3 block">
        <span className="sr-only">Quick search navigation</span>
        <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={leftSidebarSearchRef}
          type="search"
          value={leftSidebarQuery}
          onChange={(event) => setLeftSidebarQuery(event.target.value)}
          placeholder="Quick search..."
          className="cloudflare-search-input h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-14 text-[13px] text-slate-800 outline-none placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Ctrl K</kbd>
      </label>}

      <nav aria-label="Main navigation" className="admin-sidebar-nav min-h-0 w-full flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
        {navigationGroups.map((group) => {
          const query = leftSidebarQuery.trim().toLocaleLowerCase();
          const groupItems = visibleNavigation.filter((item) => group.labels.includes(item.label))
            .filter((item) => !query || item.label.toLocaleLowerCase().includes(query) ||
              item.children?.some((child) => child.label.toLocaleLowerCase().includes(query)));
          if (!groupItems.length) return null;
          return (
            <div key={group.label}>
              {!compact && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {group.label}
              </p>}
              <div className="space-y-0.5">
        {groupItems.map(({ href, label, icon: Icon, children }) => {
          const nestedNavigationActive = visibleNavigation.some(
            (item) =>
              item.href.startsWith(`${href}/`) &&
              (pathname === item.href || pathname.startsWith(`${item.href}/`)),
          );
          const active =
            pathname === href ||
            (pathname.startsWith(`${href}/`) && !nestedNavigationActive) ||
            (href === "/admin/users" && pathname.startsWith("/admin/users")) ||
            (href === "/admin/examinations" && pathname === "/admin/exam-analytics") ||
            (label === "Inventory" && (
              pathname.startsWith("/admin/inventory") ||
              pathname.startsWith("/admin/accounts")
            )) ||
            (href === "/admin/fees/collection" && pathname.startsWith("/admin/fees")) ||
            (href === "/admin/hr" && pathname === "/admin/settings/roles") ||
            (label === "System" && pathname.startsWith("/admin/system"));
          if (children) {
            const visibleSections = children.filter(
              (section) =>
                (!section.permission || permissions.includes(section.permission)) ||
                (section.permissionAlternatives?.some((permission) => permissions.includes(permission)) ?? false),
            );
            const resolvedSections = visibleSections.map((section) =>
              section.id === "inventory-reports" && !permissions.includes("inventory.manage")
                ? {
                    ...section,
                    href: "/admin/accounts?section=reports",
                    matchPath: "/admin/accounts",
                    matchQuery: { key: "section", value: "reports" },
                  }
                : section,
            );
            const isStudentInfo = href === "/admin/students";
            const isUsers = href === "/admin/users";
            const isHumanResources = href === "/admin/hr";
            const isInventory = label === "Inventory";
            const isLibrary = label === "Library";
            const isDormitories = label === "Dormitories";
            const isFees = href === "/admin/fees/collection";
            const isExaminations = href === "/admin/examinations";
            const isSystem = label === "System";
            const sectionOpen = leftSidebarQuery.trim() ? true : isStudentInfo
              ? studentInfoOpen
              : isUsers
                ? usersOpen
              : isHumanResources
                ? humanResourcesOpen
                : isInventory
                  ? inventoryOpen
                : isLibrary
                  ? libraryOpen
                : isDormitories
                  ? dormitoriesOpen
                : isFees
                  ? feesOpen
                  : isExaminations
                    ? examinationsOpen
                  : isSystem
                    ? systemOpen
                  : academicsOpen;
            const setSectionOpen = isStudentInfo
              ? setStudentInfoOpen
              : isUsers
                ? setUsersOpen
              : isHumanResources
                ? setHumanResourcesOpen
                : isInventory
                  ? setInventoryOpen
                : isLibrary
                  ? setLibraryOpen
                : isDormitories
                  ? setDormitoriesOpen
                : isFees
                  ? setFeesOpen
                  : isExaminations
                    ? setExaminationsOpen
                  : isSystem
                    ? setSystemOpen
                  : setAcademicsOpen;
            const activeChild = resolvedSections.find((section) => {
              if (!section.href) return false;
              const sectionPath = section.matchPath ?? section.href.split("?")[0];
              return (
                (sectionPath === pathname &&
                  (!section.matchQuery ||
                    searchParams.get(section.matchQuery.key) === section.matchQuery.value)) ||
                (section.id === "inventory-reports" && pathname === "/admin/accounts" &&
                  searchParams.get("section") === "reports") ||
                (section.id === "assets" && pathname === "/admin/inventory" &&
                  searchParams.get("section") === "assets") ||
                (section.id === "stock-register" && pathname === "/admin/inventory" &&
                  searchParams.get("view") === null) ||
                (section.id === "accounts-profit" && pathname === "/admin/accounts" &&
                  (searchParams.get("section") === null || searchParams.get("section") === "profit"))
              );
            });
            return (
              <div key={href}>
                <button
                  type="button"
                  aria-expanded={compact ? undefined : sectionOpen}
                  title={compact ? label : undefined}
                  onClick={() => {
                    if (compact) {
                      setDesktopSidebarExpanded(true);
                    } else if (active) {
                      setSectionOpen((value) => !value);
                    } else {
                      setSectionOpen(true);
                      router.push(href);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg py-2 text-left text-sm font-medium transition",
                    compact ? "justify-center px-0" : "px-3",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                  )}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                  {!compact && label}
                  {!compact && <ChevronDown
                    size={16}
                    className={cn("ml-auto transition-transform", sectionOpen && "rotate-180")}
                  />}
                </button>
                {!compact && sectionOpen && (
                  <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 pl-3">
                    {resolvedSections.filter((section) => !query || label.toLocaleLowerCase().includes(query) || section.label.toLocaleLowerCase().includes(query)).map((section) => {
                      if (!section.href) {
                        return (
                          <span
                            key={section.id}
                            aria-disabled="true"
                            title={`${section.label} is not available yet`}
                            className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm text-slate-400"
                          >
                            {section.label}
                            <span className="text-[10px] font-semibold uppercase tracking-wide">
                              Soon
                            </span>
                          </span>
                        );
                      }
                      const sectionActive = activeChild?.id === section.id ||
                        (section.id === "fee-structure-create" &&
                          pathname === "/admin/fees" &&
                          searchParams.get("section") === "structures");
                      return (
                        <Link
                          key={section.id}
                          href={section.href}
                          onClick={() => {
                            setOpen(false);
                            document.querySelectorAll<HTMLDialogElement>("dialog[open]")
                              .forEach((dialog) => dialog.close());
                          }}
                          aria-current={sectionActive ? "page" : undefined}
                          className={cn(
                            "block rounded-md px-3 py-1.5 text-sm transition",
                            sectionActive
                              ? "bg-blue-50 font-medium text-blue-700"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
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
              title={compact ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition",
                compact ? "justify-center px-0" : "px-3",
                active
                  ? "bg-violet-50 text-violet-800"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              {!compact && label}
              {active && !compact && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-600" />}
            </Link>
          );
        })}
              </div>
            </div>
          );
        })}
      </nav>

      <Link
        href="/guide"
        onClick={() => setOpen(false)}
        title={compact ? "User guide" : undefined}
        className={cn("mt-3 flex items-center gap-3 rounded-lg py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950", compact ? "justify-center px-0" : "px-3")}
      >
        <CircleHelp size={18} strokeWidth={1.8} />
        {!compact && "User guide"}
      </Link>

      <div className="mt-auto flex justify-center border-t border-slate-200 pt-4">
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xs font-bold text-slate-700" title={schoolName}>
          {schoolLogo
            ? <Image src={schoolLogo} unoptimized width={36} height={36} alt={`${schoolName} logo`} className="h-full w-full object-contain" />
            : schoolMonogram}
        </span>
      </div>
    </aside>
  );

  return (
    <div className="school-ui-shell admin-shell-root min-h-dvh bg-[#f6f7f9]">
      <header className="admin-print-header" aria-label={`${schoolName} letterhead`}>
        <div className="admin-print-crest" aria-hidden="true">
          {schoolLogo
            ? <Image src={schoolLogo} unoptimized width={40} height={40} alt="" className="h-full w-full rounded-full bg-white object-contain" />
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
        <div className="admin-print-seal" aria-hidden="true">SCHOOL</div>
      </header>
      <div
        ref={desktopSidebarRef}
        className={cn(
          "print:hidden fixed inset-y-0 left-0 z-30 hidden overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block",
          desktopSidebarExpanded ? "w-[260px]" : "w-[68px]",
        )}
        onMouseEnter={() => setDesktopSidebarExpanded(true)}
        onMouseLeave={() => {
          if (!desktopSidebarRef.current?.contains(document.activeElement)) setDesktopSidebarExpanded(false);
        }}
        onFocusCapture={() => setDesktopSidebarExpanded(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDesktopSidebarExpanded(false);
        }}
      >
        {sidebar(!desktopSidebarExpanded)}
      </div>
      {open && (
        <div
          ref={mobileNavigationRef}
          role="dialog"
          aria-modal="true"
          aria-label="Main navigation"
          className="print:hidden fixed inset-0 z-40 lg:hidden"
        >
          <button
            aria-label="Close navigation"
            data-drawer-backdrop
            className="absolute inset-0 bg-slate-950/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative h-dvh w-[min(280px,86vw)]">{sidebar()}</div>
          <button
            ref={closeNavigationRef}
            className="admin-mobile-navigation-close print:hidden fixed z-50 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-600 shadow-lg lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="admin-shell-content lg:pl-[68px] 2xl:pr-[68px]">
        <header className="admin-shell-topbar print:hidden sticky top-0 z-20 flex h-auto min-h-16 flex-wrap items-center justify-between gap-y-2 border-b border-slate-200 bg-white px-3 py-2 text-slate-900 sm:px-5 md:h-[76px] md:flex-nowrap md:gap-y-0 md:py-0 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={navigationTriggerRef}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
              <BookOpen size={16} />
              <span>Administration</span>
              <span>/</span>
              <span className="font-medium text-slate-900">{pageLabel}</span>
            </div>
            <span className="text-sm font-semibold text-slate-900 sm:hidden">SchoolOS</span>
          </div>

          <WorkspaceQuickSearch compactOnMobile />

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />
            <div className="relative">
              <button
                className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-white/50"
                onClick={() => setMenuOpen((value) => !value)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
                  {userName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-36 text-left sm:block">
                  <span className="block truncate text-sm font-medium text-slate-900">{userName}</span>
                  <span className="block truncate text-xs text-slate-500">{roleLabel}</span>
                </span>
                <ChevronDown size={16} className="hidden text-slate-500 sm:block" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 z-30 w-64 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl">
                  {multiSchoolEnabled && schoolChoices.length > 1 && (
                    <div className="border-b border-slate-100 px-3 py-2">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">School workspace</p>
                      {schoolChoices.map((choice) => (
                        <form action={selectSchool} key={choice.schoolPublicId}>
                          <input type="hidden" name="schoolPublicId" value={choice.schoolPublicId} />
                          <button
                            type="submit"
                            className={cn(
                              "w-full truncate rounded-lg px-2.5 py-2 text-left text-sm",
                              choice.schoolPublicId === activeSchoolPublicId
                                ? "bg-violet-50 font-semibold text-violet-800"
                                : "text-slate-600 hover:bg-slate-50",
                            )}
                          >
                            {choice.schoolName}
                            {choice.schoolPublicId === activeSchoolPublicId && <span className="float-right">Current</span>}
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                  {isPlatformAdmin && multiSchoolEnabled && (
                    <Link
                      href="/platform/schools"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      <School size={16} />
                      Platform schools
                    </Link>
                  )}
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
                  <Link
                    href="/admin/account-security"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    <KeyRound size={16} />
                    Account security
                  </Link>
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
        <main className="admin-shell-main mx-auto max-w-[1500px] px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-9">{children}</main>
      </div>
      <div
        ref={desktopRightSidebarRef}
        className={cn(
          "print:hidden fixed inset-y-0 right-0 z-10 hidden overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none 2xl:block",
          desktopRightSidebarExpanded ? "w-[260px]" : "w-[68px]",
        )}
        onMouseEnter={() => setDesktopRightSidebarExpanded(true)}
        onMouseLeave={() => {
          if (!desktopRightSidebarRef.current?.contains(document.activeElement)) setDesktopRightSidebarExpanded(false);
        }}
        onFocusCapture={() => setDesktopRightSidebarExpanded(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDesktopRightSidebarExpanded(false);
        }}
      >
      {desktopRightSidebarExpanded ? <aside className="admin-shell-right-sidebar print:hidden flex h-full w-[260px] flex-col border-l border-slate-200 bg-white px-4 pb-5 pt-[calc(76px+1.25rem)]">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-900">Workspace pages</h2>
          <p className="mt-1 text-xs text-slate-500">Search all available sections</p>
        </div>
        <label className="relative mb-4 block">
          <span className="sr-only">Search quick links</span>
          <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={rightSidebarQuery}
            onChange={(event) => setRightSidebarQuery(event.target.value)}
            placeholder="Search pages..."
          className="cloudflare-search-input h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-[13px] text-slate-800 outline-none placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          />
        </label>
        <nav aria-label="Workspace page links" className="admin-sidebar-nav min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1">
          {navigationGroups.map((group) => {
            const query = rightSidebarQuery.trim().toLocaleLowerCase();
            const items = rightSidebarItems
              .filter((item) => group.labels.includes(item.label))
              .map((item) => {
                const parentMatches = !query || item.label.toLocaleLowerCase().includes(query);
                const children = (item.children ?? []).filter((child) =>
                  child.href && (!query || parentMatches || child.label.toLocaleLowerCase().includes(query)),
                );
                return { item, children, matches: parentMatches || children.length > 0 };
              })
              .filter((entry) => entry.matches);
            if (items.length === 0) return null;
            return (
              <section key={group.label}>
                <h3 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  {group.label}
                </h3>
                <div className="space-y-1">
                  {items.map(({ item, children }) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label}>
                        <Link href={item.href} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950">
                          <Icon size={15} />
                          <span className="truncate">{item.label}</span>
                        </Link>
                        {children.length > 0 && (
                          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
                            {children.map((child) => (
                              <Link
                                key={child.id}
                                href={child.href!}
                                onClick={() => document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((dialog) => dialog.close())}
                                className="block rounded-md px-2 py-1 text-xs text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
                              >
                                {child.label}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {rightSidebarItems.every((item) => {
            const query = rightSidebarQuery.trim().toLocaleLowerCase();
            return !item.label.toLocaleLowerCase().includes(query) &&
              !(item.children ?? []).some((child) => child.label.toLocaleLowerCase().includes(query));
          }) && (
            <p className="px-2 py-3 text-xs text-slate-500">No matching links.</p>
          )}
        </nav>
      </aside> : <aside className="admin-shell-right-sidebar print:hidden flex h-full w-[68px] flex-col items-center border-l border-slate-200 bg-white pt-[calc(76px+1.25rem)]">
        <button
          type="button"
          title="Show workspace pages"
          aria-label="Show workspace pages"
          onClick={() => setDesktopRightSidebarExpanded(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <PanelRight size={18} />
        </button>
      </aside>}
      </div>
      <footer className="admin-print-footer">
        <span className="admin-print-footer-crest" aria-hidden="true">
          {schoolLogo
            ? <Image src={schoolLogo} unoptimized width={24} height={24} alt="" className="h-full w-full object-contain" />
            : schoolMonogram}
        </span>
        <span className="admin-print-footer-contact">
          <strong>{schoolName}</strong>
          <span>{[schoolAddress, schoolPhone, schoolEmail].filter(Boolean).join("  •  ") || "School contact details not configured"}</span>
        </span>
        <span className="admin-print-footer-note">Official school record<br />Handle confidentially</span>
      </footer>
    </div>
  );
}
