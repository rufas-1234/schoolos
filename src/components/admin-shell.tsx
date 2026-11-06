"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BookOpen,
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
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard, permission: "dashboard.view" },
  {
    href: "/admin/settings",
    label: "School profile",
    icon: School,
    permission: "school.settings.manage",
  },
  { href: "/admin/students", label: "Students", icon: Users, permission: "students.view" },
];

export function AdminShell({
  children,
  schoolName,
  userName,
  roleNames,
  permissions,
}: {
  children: ReactNode;
  schoolName: string;
  userName: string;
  roleNames: string[];
  permissions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const visibleNavigation = navigation.filter((item) => permissions.includes(item.permission));
  const roleLabel = roleNames.length === 1 ? roleNames[0] : "Multiple roles";

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
    <aside className="flex h-full w-[260px] flex-col border-r border-slate-100 bg-white px-5 py-6">
      <Link href="/admin/dashboard" className="mb-9 flex items-center gap-3 px-1">
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
      <nav className="space-y-1">
        {visibleNavigation.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
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
        <p className="text-sm font-semibold text-slate-800">Foundation phase</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Your workspace is ready for secure school setup.
        </p>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f7f7fa]">
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative h-full w-[280px]">{sidebar}</div>
        </div>
      )}

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-100 bg-white/90 px-5 backdrop-blur md:px-8">
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
              <span className="font-semibold text-slate-700">
                {visibleNavigation.find((item) => item.href === pathname)?.label ?? "Workspace"}
              </span>
            </div>
            <span className="text-sm font-semibold text-slate-800 sm:hidden">SchoolOS</span>
          </div>

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
          <p role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm text-rose-700 md:px-8">
            {signOutError}
          </p>
        )}
        <main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-9">{children}</main>
      </div>
      {open && (
        <button
          className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-600 shadow-lg lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
