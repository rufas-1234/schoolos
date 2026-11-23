import { and, count, eq, inArray, isNull } from "drizzle-orm";
import {
  ArrowUpRight,
  BookOpenCheck,
  ClipboardList,
  GraduationCap,
  IdCard,
  Users,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import {
  studentCategories,
  studentEnrollments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getSchoolAcademicYearSelection } from "@/lib/academic-year-selection";

type OverviewTone = "violet" | "emerald" | "amber" | "sky";

const toneStyles: Record<OverviewTone, { icon: string; hover: string }> = {
  violet: { icon: "bg-violet-50 text-violet-700", hover: "hover:border-violet-200" },
  emerald: { icon: "bg-emerald-50 text-emerald-700", hover: "hover:border-emerald-200" },
  amber: { icon: "bg-amber-50 text-amber-700", hover: "hover:border-amber-200" },
  sky: { icon: "bg-sky-50 text-sky-700", hover: "hover:border-sky-200" },
};

export default async function StudentOverviewPage() {
  const context = await requireSchoolPermission("students.view");
  const { selectedYear: activeYear } = await getSchoolAcademicYearSelection(context.schoolId);
  const [studentStatusCounts, [categoryCount]] = await Promise.all([
    db
      .select({ status: students.status, total: count() })
      .from(students)
      .where(eq(students.schoolId, context.schoolId))
      .groupBy(students.status),
    db
      .select({ total: count() })
      .from(studentCategories)
      .where(eq(studentCategories.schoolId, context.schoolId)),
  ]);
  const totalCount = studentStatusCounts.reduce((sum, item) => sum + item.total, 0);
  const activeCount = studentStatusCounts.find((item) => item.status === "active")?.total ?? 0;
  const pendingCount = studentStatusCounts.find((item) => item.status === "pending")?.total ?? 0;
  let unassignedCount = 0;

  if (activeYear) {
    const [result] = await db
      .select({ total: count() })
      .from(students)
      .leftJoin(
        studentEnrollments,
        and(
          eq(studentEnrollments.studentId, students.id),
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.academicYearId, activeYear.id),
          inArray(studentEnrollments.status, ["pending", "enrolled"]),
        ),
      )
      .where(and(
        eq(students.schoolId, context.schoolId),
        inArray(students.status, ["admitted", "active"]),
        isNull(studentEnrollments.id),
      ));
    unassignedCount = result?.total ?? 0;
  }

  const canCreate = context.grantedPermissions.includes("students.create");
  const canUpdate = context.grantedPermissions.includes("students.update");
  const metrics = [
    {
      href: "/admin/students?action=all",
      label: "Total students",
      value: totalCount,
      detail: "Open the full student register",
      icon: Users,
      tone: "violet" as const,
    },
    {
      href: "/admin/students?search=status%3Aactive",
      label: "Active students",
      value: activeCount,
      detail: "View active student records",
      icon: GraduationCap,
      tone: "emerald" as const,
    },
    {
      href: "/admin/students?search=status%3Apending",
      label: "Pending admissions",
      value: pendingCount,
      detail: "Review pending student records",
      icon: ClipboardList,
      tone: "amber" as const,
    },
    {
      href: "/admin/students/unassigned",
      label: "Unassigned students",
      value: unassignedCount,
      detail: activeYear
        ? `Without a class enrollment for ${activeYear.name}`
        : "Set an academic year to review placements",
      icon: UserPlus,
      tone: "sky" as const,
    },
  ];
  const shortcuts = [
    {
      href: "/admin/students?action=all",
      title: "Student directory",
      detail: "Search and review student records.",
      icon: Users,
      tone: "violet" as const,
      visible: true,
    },
    {
      href: "/admin/admissions",
      title: "Admission desk",
      detail: "Review and process admission requests.",
      icon: ClipboardList,
      tone: "amber" as const,
      visible: canUpdate,
    },
    {
      href: "/admin/students/categories",
      title: "Student categories",
      detail: `${categoryCount?.total ?? 0} categories configured.`,
      icon: GraduationCap,
      tone: "emerald" as const,
      visible: canUpdate,
    },
    {
      href: "/admin/students/ids",
      title: "Student ID cards",
      detail: "View and print student identification cards.",
      icon: IdCard,
      tone: "sky" as const,
      visible: true,
    },
    {
      href: "/admin/students/groups",
      title: "Student groups",
      detail: "Organize students into school groups.",
      icon: Users,
      tone: "violet" as const,
      visible: true,
    },
    {
      href: "/admin/students/behavior",
      title: "Student Behaviours",
      detail: "Review behavior records and actions.",
      icon: BookOpenCheck,
      tone: "amber" as const,
      visible: canUpdate,
    },
    {
      href: "/admin/students/reports",
      title: "Student reports",
      detail: "Review and print student reports.",
      icon: ClipboardList,
      tone: "emerald" as const,
      visible: true,
    },
  ].filter((shortcut) => shortcut.visible);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-white to-violet-50/80 p-6 shadow-sm sm:flex-row sm:items-end sm:p-8">
        <div>
          <p className="text-sm font-semibold text-violet-700">Student Info</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Student overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            A school-scoped snapshot of student records and the actions your team uses most.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Link
              href="/admin/students?action=add"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
            >
              Add student
              <ArrowUpRight size={16} />
            </Link>
          )}
          <Link
            href="/admin/students?action=all"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50"
          >
            Student directory
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>

      <section aria-label="Student metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Student services</h2>
            <p className="mt-1 text-sm text-slate-500">Go directly to common student workflows.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((shortcut) => (
            <ShortcutCard
              key={shortcut.title}
              href={shortcut.href}
              title={shortcut.title}
              detail={shortcut.detail}
              icon={shortcut.icon}
              tone={shortcut.tone}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  href,
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: OverviewTone;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 ${toneStyles[tone].hover}`}
    >
      <span className="flex items-center justify-between gap-4">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneStyles[tone].icon}`}>
          <Icon size={19} />
        </span>
        <ArrowUpRight size={17} className="text-slate-400 transition group-hover:text-violet-700" />
      </span>
      <span className="mt-4 block text-sm font-medium text-slate-500">{label}</span>
      <span className="mt-1 block text-3xl font-bold tracking-tight text-slate-900">
        {new Intl.NumberFormat("en").format(value)}
      </span>
      <span className="mt-2 block text-xs leading-5 text-slate-500">{detail}</span>
    </Link>
  );
}

function ShortcutCard({
  href,
  title,
  detail,
  icon: Icon,
  tone,
}: {
  href: string;
  title: string;
  detail: string;
  icon: LucideIcon;
  tone: OverviewTone;
}) {
  return (
    <Link
      href={href}
      className={`group flex min-h-28 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 ${toneStyles[tone].hover}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneStyles[tone].icon}`}>
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-900">{title}</span>
          <ArrowUpRight size={16} className="shrink-0 text-slate-400 transition group-hover:text-violet-700" />
        </span>
        <span className="mt-1 block text-sm leading-5 text-slate-500">{detail}</span>
      </span>
    </Link>
  );
}
