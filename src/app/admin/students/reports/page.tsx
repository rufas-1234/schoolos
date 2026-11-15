import Link from "next/link";
import { ArrowUpRight, ClipboardList, GraduationCap, Printer } from "lucide-react";
import { requireSchoolPermission } from "@/lib/access-control";

const reports = [
  {
    title: "Student Report",
    description: "Search the student directory, review student details, and print or save a filtered list.",
    href: "/admin/students?action=export",
    icon: ClipboardList,
    permission: "students.view",
  },
  {
    title: "Student Attendance Report",
    description: "Choose a class section and date to review the attendance register and print the roster.",
    href: "/admin/academics?section=attendance",
    icon: Printer,
    permission: "school.settings.manage",
  },
  {
    title: "Class Routine",
    description: "View and print the timetable for a selected class section.",
    href: "/admin/academics?section=routines",
    icon: GraduationCap,
    permission: "school.settings.manage",
  },
] as const;

export default async function StudentReportsPage() {
  const context = await requireSchoolPermission("students.view");
  const permissions = new Set(context.grantedPermissions);
  const availableReports = reports.filter((report) => permissions.has(report.permission));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">Student Info</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Student Reports</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Open a supported report to filter the records, review the results, and print or save them as a PDF.
        </p>
      </header>
      <section aria-label="Available student reports" className="grid gap-4 md:grid-cols-2">
        {availableReports.map(({ title, description, href, icon: Icon }) => (
          <Link
            key={title}
            href={href}
            className="group flex min-h-40 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md"
          >
            <span className="rounded-xl bg-violet-50 p-3 text-violet-700">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 font-semibold text-slate-950">
                {title}
                <ArrowUpRight size={17} aria-hidden="true" className="shrink-0 text-slate-400 transition group-hover:text-violet-700" />
              </span>
              <span className="mt-2 block text-sm leading-6 text-slate-600">{description}</span>
            </span>
          </Link>
        ))}
      </section>
      {availableReports.length === 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No student reports are available for your account.
        </p>
      )}
    </main>
  );
}
