import { and, asc, count, countDistinct, eq, ne } from "drizzle-orm";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  GraduationCap,
  Layers3,
  MapPinned,
  Sun,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classLevels,
  classRooms,
  classSections,
  classSubjects,
  schoolBranches,
  studentEnrollments,
  students,
  subjects,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

type OverviewTone = "violet" | "emerald" | "amber" | "sky" | "orange";
type TermSummary = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  examStartDate: string | null;
  examEndDate: string | null;
};

const toneStyles: Record<OverviewTone, { icon: string; hover: string }> = {
  violet: { icon: "bg-violet-50 text-violet-700", hover: "hover:border-violet-200" },
  emerald: { icon: "bg-emerald-50 text-emerald-700", hover: "hover:border-emerald-200" },
  amber: { icon: "bg-amber-50 text-amber-700", hover: "hover:border-amber-200" },
  sky: { icon: "bg-sky-50 text-sky-700", hover: "hover:border-sky-200" },
  orange: { icon: "bg-orange-50 text-orange-700", hover: "hover:border-orange-200" },
};

export default async function AcademicOverviewPage() {
  const context = await requireSchoolPermission(["academics.manage", "school.settings.manage"]);
  const [
    activeYears,
    [branchCountRow],
    [activeClassCountRow],
    [subjectCountRow],
    [subjectAssignmentCountRow],
    [classroomCountRow],
  ] = await Promise.all([
    db
      .select({
        id: academicYears.id,
        name: academicYears.name,
        startDate: academicYears.startDate,
        endDate: academicYears.endDate,
      })
      .from(academicYears)
      .where(and(
        eq(academicYears.schoolId, context.schoolId),
        eq(academicYears.status, "active"),
      ))
      .orderBy(asc(academicYears.startDate))
      .limit(1),
    db
      .select({ total: count() })
      .from(schoolBranches)
      .where(and(
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      )),
    db
      .select({ total: count() })
      .from(classLevels)
      .where(and(
        eq(classLevels.schoolId, context.schoolId),
        eq(classLevels.status, "active"),
      )),
    db
      .select({ total: count() })
      .from(subjects)
      .where(eq(subjects.schoolId, context.schoolId)),
    db
      .select({ total: count() })
      .from(classSubjects)
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSubjects.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
        eq(classLevels.status, "active"),
      ))
      .where(eq(classSubjects.schoolId, context.schoolId)),
    db
      .select({ total: count() })
      .from(classRooms)
      .where(eq(classRooms.schoolId, context.schoolId)),
  ]);
  const activeYear = activeYears[0];
  const branchCount = branchCountRow?.total ?? 0;
  const activeClassCount = activeClassCountRow?.total ?? 0;
  const subjectCount = subjectCountRow?.total ?? 0;
  const subjectAssignmentCount = subjectAssignmentCountRow?.total ?? 0;
  const classroomCount = classroomCountRow?.total ?? 0;
  let classSectionCount = 0;
  let enrollmentCounts: Array<{ status: string; total: number }> = [];
  let terms: TermSummary[] = [];

  if (activeYear) {
    const [sectionCountRows, yearEnrollments, yearTerms] = await Promise.all([
      db
        .select({ total: count() })
        .from(classSections)
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
          eq(classLevels.status, "active"),
        ))
        .where(and(
          eq(classSections.schoolId, context.schoolId),
          eq(classSections.academicYearId, activeYear.id),
        )),
      db
        .select({
          status: studentEnrollments.status,
          total: countDistinct(studentEnrollments.studentId),
        })
        .from(studentEnrollments)
        .innerJoin(students, and(
          eq(students.id, studentEnrollments.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.academicYearId, activeYear.id),
          ne(students.status, "disabled"),
        ))
        .groupBy(studentEnrollments.status),
      db
        .select({
          id: academicTerms.id,
          name: academicTerms.name,
          startDate: academicTerms.startDate,
          endDate: academicTerms.endDate,
          examStartDate: academicTerms.examStartDate,
          examEndDate: academicTerms.examEndDate,
        })
        .from(academicTerms)
        .where(and(
          eq(academicTerms.schoolId, context.schoolId),
          eq(academicTerms.academicYearId, activeYear.id),
        ))
        .orderBy(asc(academicTerms.startDate))
        .limit(6),
    ]);
    classSectionCount = sectionCountRows[0]?.total ?? 0;
    enrollmentCounts = yearEnrollments;
    terms = yearTerms;
  }

  const enrolledCount = enrollmentCounts.find((item) => item.status === "enrolled")?.total ?? 0;
  const pendingPlacementCount = enrollmentCounts.find((item) => item.status === "pending")?.total ?? 0;
  const metrics = [
    {
      href: "/admin/academics?section=years",
      label: "Active academic year",
      value: activeYear?.name ?? "Not set",
      detail: activeYear
        ? `${formatDate(activeYear.startDate)} – ${formatDate(activeYear.endDate)}`
        : "Set a year to organize classes and enrollment",
      icon: CalendarDays,
      tone: "violet" as const,
    },
    {
      href: "/admin/academics?section=enrollment",
      label: "Enrolled students",
      value: enrolledCount,
      detail: activeYear ? `Enrolled in ${activeYear.name}` : "No active academic year",
      icon: GraduationCap,
      tone: "emerald" as const,
    },
    {
      href: "/admin/academics?section=enrollment",
      label: "Pending placements",
      value: pendingPlacementCount,
      detail: activeYear ? "Awaiting enrollment confirmation" : "No active academic year",
      icon: ClipboardCheck,
      tone: "amber" as const,
    },
    {
      href: "/admin/academics?section=sections",
      label: "Class sections",
      value: classSectionCount,
      detail: activeYear
        ? `${activeClassCount} active classes · ${branchCount} active branches`
        : "Set an active year to view its sections",
      icon: Layers3,
      tone: "sky" as const,
    },
    {
      href: "/admin/academics?section=subjects",
      label: "Subjects",
      value: subjectCount,
      detail: `${subjectAssignmentCount} assignments to active classes`,
      icon: BookOpen,
      tone: "orange" as const,
    },
  ];
  const shortcuts = [
    {
      href: "/admin/academics?section=branches",
      title: "Branches",
      detail: `${branchCount} active school branches.`,
      icon: MapPinned,
      tone: "violet" as const,
    },
    {
      href: "/admin/academics?section=years",
      title: "Academic years",
      detail: activeYear ? `${activeYear.name} is active.` : "Create and activate an academic year.",
      icon: CalendarDays,
      tone: "emerald" as const,
    },
    {
      href: "/admin/academics?section=terms",
      title: "Terms & exams",
      detail: `${terms.length} terms in the active academic year.`,
      icon: ClipboardList,
      tone: "amber" as const,
    },
    {
      href: "/admin/academics?section=classes",
      title: "Classes & sections",
      detail: `${activeClassCount} active classes · ${classSectionCount} sections.`,
      icon: Layers3,
      tone: "sky" as const,
    },
    {
      href: "/admin/academics?section=subjects",
      title: "Subjects",
      detail: `${subjectCount} subjects · ${subjectAssignmentCount} class assignments.`,
      icon: BookOpen,
      tone: "orange" as const,
    },
    {
      href: "/admin/academics?section=optional-subjects",
      title: "Optional subjects",
      detail: "Review elective subjects assigned to classes.",
      icon: GraduationCap,
      tone: "violet" as const,
    },
    {
      href: "/admin/academics?section=enrollment",
      title: "Student enrollment",
      detail: `${enrolledCount} enrolled · ${pendingPlacementCount} pending placements.`,
      icon: ClipboardCheck,
      tone: "emerald" as const,
    },
    {
      href: "/admin/academics?section=attendance",
      title: "Attendance",
      detail: "Record and review daily class attendance.",
      icon: ClipboardList,
      tone: "amber" as const,
    },
    {
      href: "/admin/academics/attendance-reports",
      title: "Attendance reports",
      detail: "Review attendance history by date, class, and student.",
      icon: ClipboardCheck,
      tone: "sky" as const,
    },
    {
      href: "/admin/academics?section=routines",
      title: "Class routines",
      detail: "Build and print weekly class timetables.",
      icon: CalendarDays,
      tone: "violet" as const,
    },
    {
      href: "/admin/academics?section=classrooms",
      title: "Classrooms",
      detail: `${classroomCount} rooms configured.`,
      icon: DoorOpen,
      tone: "orange" as const,
    },
    {
      href: "/admin/academics?section=holidays",
      title: "Holidays",
      detail: "Manage school breaks and academic holidays.",
      icon: Sun,
      tone: "amber" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-950 p-6 text-white shadow-sm sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[28px] border-white/5"
        />
        <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-violet-200">Academics</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Academic overview
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100/80">
              Monitor the school year, enrollment, class structure, and subjects for {context.schoolName}.
            </p>
            {activeYear && (
              <p className="mt-4 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                Active year · {activeYear.name}
              </p>
            )}
          </div>
          <Link
            href="/admin/academics?section=years"
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-[#f38020] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#df6f13] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:self-auto"
          >
            {activeYear ? "Manage academic year" : "Set academic year"}
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>

      <section aria-label="Academic metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Academic operations</h2>
          <p className="mt-1 text-sm text-slate-500">Go directly to the setup and daily workflows your school uses.</p>
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
            <h2 className="font-semibold text-slate-900">Term and examination calendar</h2>
            <p className="mt-1 text-sm text-slate-500">
              {activeYear ? `Schedule for ${activeYear.name}` : "Activate an academic year to manage its terms."}
            </p>
          </div>
          <Link
            href="/admin/academics?section=terms"
            className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700 hover:text-violet-900"
          >
            Manage terms
            <ArrowUpRight size={15} />
          </Link>
        </div>
        {terms.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {activeYear ? "No terms have been added to the active academic year yet." : "No active academic year is set."}
          </p>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {terms.map((term) => (
              <li key={term.id} className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                <h3 className="font-semibold text-slate-900">{term.name}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDate(term.startDate)} – {formatDate(term.endDate)}
                </p>
                {term.examStartDate && term.examEndDate && (
                  <p className="mt-2 text-xs font-medium text-violet-800">
                    Exams · {formatDate(term.examStartDate)} – {formatDate(term.examEndDate)}
                  </p>
                )}
              </li>
            ))}
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
  value: string | number;
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
      <span className="mt-1 block truncate text-2xl font-bold tracking-tight text-slate-900">
        {typeof value === "number" ? new Intl.NumberFormat("en").format(value) : value}
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
