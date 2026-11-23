import { and, asc, count, eq, gt, gte, lte } from "drizzle-orm";
import {
  ArrowUpRight,
  Award,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  FileText,
  PenLine,
  Timer,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import {
  academicYears,
  examClasses,
  examinations,
  examSubjects,
  schoolBranches,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getSchoolAcademicYearSelection } from "@/lib/academic-year-selection";

type OverviewTone = "violet" | "emerald" | "amber" | "sky" | "orange";
const toneStyles: Record<OverviewTone, { icon: string; hover: string }> = {
  violet: { icon: "bg-violet-50 text-violet-700", hover: "hover:border-violet-200" },
  emerald: { icon: "bg-emerald-50 text-emerald-700", hover: "hover:border-emerald-200" },
  amber: { icon: "bg-amber-50 text-amber-700", hover: "hover:border-amber-200" },
  sky: { icon: "bg-sky-50 text-sky-700", hover: "hover:border-sky-200" },
  orange: { icon: "bg-orange-50 text-orange-700", hover: "hover:border-orange-200" },
};

export default async function ExaminationsOverviewPage() {
  const context = await requireSchoolPermission(["examinations.create", "results.publish"]);
  const canCreateExams = context.grantedPermissions.includes("examinations.create");
  const { selectedYear: activeYear } = await getSchoolAcademicYearSelection(context.schoolId);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: context.schoolTimezone,
  }).format(new Date());
  const examScope = and(
    eq(examinations.schoolId, context.schoolId),
    ...(activeYear ? [eq(examinations.academicYearId, activeYear.id)] : []),
  );
  const [
    statusCounts,
    [upcomingCountRow],
    [inProgressCountRow],
    scheduledExams,
    [classCountRow],
    [subjectCountRow],
  ] = await Promise.all([
    db
      .select({ status: examinations.status, total: count() })
      .from(examinations)
      .where(examScope)
      .groupBy(examinations.status),
    db
      .select({ total: count() })
      .from(examinations)
      .where(and(
        examScope,
        eq(examinations.status, "open"),
        gt(examinations.startDate, today),
      )),
    db
      .select({ total: count() })
      .from(examinations)
      .where(and(
        examScope,
        eq(examinations.status, "open"),
        lte(examinations.startDate, today),
        gte(examinations.endDate, today),
      )),
    db
      .select({
        id: examinations.id,
        name: examinations.name,
        startDate: examinations.startDate,
        endDate: examinations.endDate,
        branchName: schoolBranches.name,
      })
      .from(examinations)
      .innerJoin(academicYears, and(
        eq(academicYears.id, examinations.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .leftJoin(schoolBranches, and(
        eq(schoolBranches.id, examinations.branchId!),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .where(and(
        examScope,
        eq(examinations.status, "open"),
        gte(examinations.endDate, today),
      ))
      .orderBy(asc(examinations.startDate), asc(examinations.id))
      .limit(6),
    db
      .select({ total: count() })
      .from(examClasses)
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
        eq(examClasses.schoolId, context.schoolId),
      ))
      .where(examScope),
    db
      .select({ total: count() })
      .from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
        eq(examSubjects.schoolId, context.schoolId),
      ))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
      .where(examScope),
  ]);
  const totalCount = statusCounts.reduce((sum, item) => sum + item.total, 0);
  const publishedCount = statusCounts.find((item) => item.status === "published")?.total ?? 0;
  const upcomingCount = upcomingCountRow?.total ?? 0;
  const inProgressCount = inProgressCountRow?.total ?? 0;
  const examClassCount = classCountRow?.total ?? 0;
  const examSubjectCount = subjectCountRow?.total ?? 0;
  const metrics = [
    {
      href: "/admin/examinations?section=setup",
      label: activeYear ? "Exams this academic year" : "Exams on record",
      value: totalCount,
      detail: activeYear ? activeYear.name : "Across all academic years",
      icon: BookOpen,
      tone: "violet" as const,
    },
    {
      href: "/admin/examinations?section=schedule",
      label: "Upcoming exams",
      value: upcomingCount,
      detail: "Scheduled to start after today",
      icon: CalendarDays,
      tone: "sky" as const,
    },
    {
      href: "/admin/examinations?section=schedule",
      label: "In progress",
      value: inProgressCount,
      detail: "Exams running today",
      icon: Timer,
      tone: "amber" as const,
    },
    {
      href: "/admin/examinations/report-center/exam-routine",
      label: "Results published",
      value: publishedCount,
      detail: "Exams with released results",
      icon: Award,
      tone: "emerald" as const,
    },
  ];
  const shortcuts = [
    {
      href: "/admin/examinations?section=types",
      title: "Exam types",
      detail: "Configure school exam types and grading behavior.",
      icon: BookOpen,
      tone: "violet" as const,
    },
    {
      href: "/admin/examinations?section=setup",
      title: "Exam setup",
      detail: `${totalCount} exams · ${examClassCount} class entries.`,
      icon: ClipboardCheck,
      tone: "emerald" as const,
    },
    {
      href: "/admin/examinations?section=schedule",
      title: "Exam schedule",
      detail: "Review dates, classes, and subject schedules.",
      icon: CalendarDays,
      tone: "sky" as const,
    },
    {
      href: "/admin/examinations?section=attendance",
      title: "Exam attendance",
      detail: "Record and review attendance for exam sittings.",
      icon: ClipboardCheck,
      tone: "amber" as const,
    },
    {
      href: "/admin/examinations?section=marks",
      title: "Marks register",
      detail: `${examSubjectCount} exam subjects available for marks entry.`,
      icon: FileText,
      tone: "orange" as const,
    },
    {
      href: "/admin/examinations?section=grades",
      title: "Marks grades",
      detail: "Manage grading scales and marks bands.",
      icon: Award,
      tone: "violet" as const,
    },
    {
      href: "/admin/examinations/report-center/exam-routine",
      title: "Reports center",
      detail: "Open merit lists, marksheets, tabulation, and progress cards.",
      icon: FileText,
      tone: "emerald" as const,
    },
    {
      href: "/admin/exam-analytics",
      title: "Exam analytics",
      detail: "Compare student, class, and subject performance.",
      icon: ChartNoAxesCombined,
      tone: "sky" as const,
    },
    {
      href: "/admin/examinations/signatures",
      title: "Report signatures",
      detail: "Manage authorized exam report signatures.",
      icon: PenLine,
      tone: "amber" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-violet-900 to-orange-800 p-6 text-white shadow-sm sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[28px] border-white/5"
        />
        <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-violet-200">Examinations</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Exams overview
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100/80">
              Track exam schedules and results for {context.schoolName}.
            </p>
            {activeYear && (
              <p className="mt-4 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                Selected year · {activeYear.name}
              </p>
            )}
          </div>
          <Link
            href={canCreateExams
              ? "/admin/examinations?section=setup"
              : "/admin/examinations/report-center/exam-routine"}
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-[#f38020] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#df6f13] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:self-auto"
          >
            {canCreateExams ? "Set up an exam" : "Review exam results"}
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>

      <section aria-label="Exam metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Exam workflows</h2>
          <p className="mt-1 text-sm text-slate-500">Open a setup, assessment, or reporting workspace.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((shortcut) => (
            <ShortcutCard key={shortcut.title} {...shortcut} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-900">Upcoming and active exams</h2>
            <p className="mt-1 text-sm text-slate-500">
              {activeYear ? `Schedules for ${activeYear.name}` : "Open exams across all academic years"}
            </p>
          </div>
          <Link
            href="/admin/examinations?section=schedule"
            className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700 hover:text-violet-900"
          >
            View schedule
            <ArrowUpRight size={15} />
          </Link>
        </div>
        {scheduledExams.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No open exams are currently scheduled.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-slate-100">
            {scheduledExams.map((exam) => {
              const isInProgress = exam.startDate <= today && exam.endDate >= today;
              return (
                <li key={exam.id}>
                  <Link
                    href={`/admin/examinations/${exam.id}`}
                    className="group flex flex-col gap-2 rounded-xl px-3 py-3 transition hover:bg-violet-50/70 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900 group-hover:text-violet-800">
                        {exam.name}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {exam.branchName ?? "All branches"} · {formatDate(exam.startDate)} – {formatDate(exam.endDate)}
                      </span>
                    </span>
                    <span className={`inline-flex w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isInProgress ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
                    }`}>
                      {isInProgress ? "In progress" : "Upcoming"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
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

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
