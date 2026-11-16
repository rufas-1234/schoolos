"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { GraduationCap, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function TeacherPortalShell({
  children,
  schoolName,
  teacherName,
}: {
  children: ReactNode;
  schoolName: string;
  teacherName: string;
}) {
  const router = useRouter();
  const [signOutError, setSignOutError] = useState("");

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

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <Link href="/portal/teacher" className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-700 text-white">
              <GraduationCap size={24} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block max-w-[60vw] truncate font-bold text-slate-950 sm:max-w-none">{schoolName}</span>
              <span className="block text-xs text-slate-500">Teacher Portal</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-slate-700 sm:inline">{teacherName}</span>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
        <nav aria-label="Teacher workspace" className="overflow-x-auto overscroll-x-contain border-t border-slate-100">
          <div className="mx-auto flex w-max min-w-full max-w-7xl flex-nowrap gap-2 px-3 py-3 sm:px-5">
            {[
              { href: "/admin/academics?section=years", label: "Manage academics" },
              { href: "/admin/students", label: "Student info" },
              { href: "/admin/examinations?section=setup", label: "Examinations" },
              { href: "/admin/examinations?section=marks", label: "Enter marks" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        {signOutError && (
          <p role="alert" className="mx-auto max-w-7xl px-5 pb-3 text-sm text-rose-700">
            {signOutError}
          </p>
        )}
      </header>
      {children}
    </div>
  );
}
