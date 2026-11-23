import { and, count, desc, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  CircleHelp,
  ClipboardList,
  GraduationCap,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { db } from "@/db";
import {
  academicYears,
  auditLogs,
  schoolMemberships,
  staffMembers,
  staffApplications,
  studentEnrollments,
  students,
  teachers,
  user,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { schoolLogoSource } from "@/lib/school-logo";
import { WorkspaceQuickSearch } from "@/components/workspace-quick-search";
import { getSchoolAcademicYearSelection } from "@/lib/academic-year-selection";

export default async function DashboardPage() {
  const context = await requireSchoolPermission("dashboard.view");
  const { selectedYear } = await getSchoolAcademicYearSelection(context.schoolId);
  const [
    membersResult,
    studentsResult,
    pendingStudentsResult,
    enrollmentResult,
    teachersResult,
    staffResult,
    pendingStaffResult,
    recentActivity,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(schoolMemberships)
      .where(eq(schoolMemberships.schoolId, context.schoolId)),
    db
      .select({ value: count() })
      .from(students)
      .where(and(eq(students.schoolId, context.schoolId), eq(students.status, "active"))),
    db
      .select({ value: count() })
      .from(students)
      .where(and(eq(students.schoolId, context.schoolId), eq(students.status, "pending"))),
    selectedYear
      ? db
        .select({ value: count() })
        .from(studentEnrollments)
        .innerJoin(academicYears, and(
          eq(studentEnrollments.academicYearId, academicYears.id),
          eq(academicYears.schoolId, context.schoolId),
        ))
        .where(and(
          eq(studentEnrollments.schoolId, context.schoolId),
          eq(studentEnrollments.academicYearId, selectedYear.id),
          eq(studentEnrollments.status, "enrolled"),
        ))
      : Promise.resolve([{ value: 0 }]),
    db
      .select({ value: count() })
      .from(teachers)
      .where(and(eq(teachers.schoolId, context.schoolId), eq(teachers.status, "active"))),
    db
      .select({ value: count() })
      .from(staffMembers)
      .where(and(eq(staffMembers.schoolId, context.schoolId), eq(staffMembers.status, "active"))),
    context.grantedPermissions.includes("staff.manage") || context.grantedPermissions.includes("school.settings.manage")
      ? db.select({ value: count() }).from(staffApplications).where(and(
        eq(staffApplications.schoolId, context.schoolId),
        eq(staffApplications.status, "pending"),
      ))
      : Promise.resolve([{ value: 0 }]),
    db
      .select({
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        actorName: user.name,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .innerJoin(user, eq(auditLogs.actorUserId, user.id))
      .where(eq(auditLogs.schoolId, context.schoolId))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(6),
  ]);
  const memberCount = Number(membersResult[0]?.value ?? 0);
  const studentCount = Number(studentsResult[0]?.value ?? 0);
  const pendingStudentCount = Number(pendingStudentsResult[0]?.value ?? 0);
  const enrollmentCount = Number(enrollmentResult[0]?.value ?? 0);
  const teacherCount = Number(teachersResult[0]?.value ?? 0);
  const staffCount = Number(staffResult[0]?.value ?? 0);
  const pendingStaffCount = Number(pendingStaffResult[0]?.value ?? 0);
  const canManageFees = context.grantedPermissions.includes("fees.manage");
  const canRecordPayments = context.grantedPermissions.includes("payments.record");
  const schoolLogo = schoolLogoSource(context.schoolLogoUrl);
  const schoolMonogram = context.schoolName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase() || "S";
  const quickAccess = [
    context.grantedPermissions.includes("students.view") && {
      href: "/admin/students",
      label: "Students",
      icon: <GraduationCap size={20} />,
      color: "bg-violet-50 text-violet-700",
    },
    (context.grantedPermissions.includes("academics.manage") || context.grantedPermissions.includes("school.settings.manage")) && {
      href: "/admin/academics",
      label: "Academics",
      icon: <CalendarDays size={20} />,
      color: "bg-sky-50 text-sky-700",
    },
    (context.grantedPermissions.includes("examinations.create") || context.grantedPermissions.includes("results.enter") || context.grantedPermissions.includes("results.publish")) && {
      href: context.grantedPermissions.includes("results.enter") ? "/portal/teacher" : "/admin/examinations",
      label: "Exams",
      icon: <BookOpen size={20} />,
      color: "bg-amber-50 text-amber-700",
    },
    (canManageFees || canRecordPayments) && {
      href: canManageFees ? "/admin/fees" : "/admin/fees/collection",
      label: "Fees",
      icon: <CircleDollarSign size={20} />,
      color: "bg-emerald-50 text-emerald-700",
    },
  ].filter((item) => item !== false);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">
            {new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(new Date())}
          </p>
          <h1 className="mt-3 text-2xl font-bold leading-tight text-slate-900">
            Hello, {context.user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Your school, at a glance.
          </p>
        </div>
      </section>

      <div className="hidden flex-col justify-between gap-4 md:flex md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-violet-700">
            {new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(new Date())}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome to your workspace
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Welcome back, {context.user.name.split(" ")[0]}. Here&apos;s your school at a glance.
          </p>
        </div>
        <Link
          href="/admin/settings"
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 sm:self-auto"
        >
          Configure school
          <ArrowUpRight size={16} />
        </Link>
      </div>

      <div className="mx-auto w-full max-w-5xl">
        <WorkspaceQuickSearch instanceId="dashboard-center-search" variant="hero" />
      </div>

      {pendingStudentCount > 0 && (
        <Link
          href="/admin/students"
          className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300 hover:bg-amber-100/70 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm">
              <ClipboardList size={19} />
            </span>
            <span>
              <span className="block font-semibold text-amber-950">
                {pendingStudentCount} admission{pendingStudentCount === 1 ? "" : "s"} need review
              </span>
              <span className="mt-1 block text-sm text-amber-800">
                Review pending student applications in the directory.
              </span>
            </span>
          </div>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-900">
            Review admissions <ArrowUpRight size={16} />
          </span>
        </Link>
      )}

      {pendingStaffCount > 0 && (
        <Link
          href="/admin/staff/applications"
          className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 transition hover:border-sky-300 hover:bg-sky-100/70 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm">
              <BriefcaseBusiness size={19} />
            </span>
            <span>
              <span className="block font-semibold text-sky-950">
                {pendingStaffCount} staff registration{pendingStaffCount === 1 ? " needs" : "s need"} approval
              </span>
              <span className="mt-1 block text-sm text-sky-800">Review staff registration details before adding them to the school.</span>
            </span>
          </div>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-sky-900">
            Review staff registrations <ArrowUpRight size={16} />
          </span>
        </Link>
      )}

      {quickAccess.length > 0 && (
        <section className="space-y-3 md:hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Quick access</h2>
            <span className="text-xs font-medium text-slate-400">Your workspace</span>
          </div>
          <div className="grid grid-cols-2 gap-3 min-[400px]:grid-cols-4">
            {quickAccess.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-center shadow-sm transition active:scale-[0.98] hover:border-violet-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}>
                  {item.icon}
                </span>
                <span className="text-xs font-semibold leading-tight text-slate-700">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <MetricCard
          title="School members"
          value={memberCount}
          detail="Authorized accounts"
          icon={<Users size={19} />}
          color="violet"
          href="/admin/settings"
        />
        <MetricCard
          title="Active students"
          value={studentCount}
          detail="Current student profiles"
          icon={<GraduationCap size={19} />}
          color="green"
          href="/admin/students"
        />
        <MetricCard
          title="Current enrollments"
          value={enrollmentCount}
          detail={selectedYear ? `In ${selectedYear.name}` : "No academic year available"}
          icon={<CalendarDays size={19} />}
          color="blue"
          href="/admin/academics?section=enrollment"
        />
        <MetricCard
          title="Teachers"
          value={teacherCount}
          detail="Active teaching staff"
          icon={<BriefcaseBusiness size={19} />}
          color="peach"
          href="/admin/academics?section=teachers"
        />
        <MetricCard
          title="Other staff"
          value={staffCount}
          detail="Active school employees"
          icon={<Users size={19} />}
          color="amber"
          href="/admin/staff"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-violet-50 text-xs font-bold text-violet-800" title={context.schoolName}>
              {schoolLogo
                ? <Image src={schoolLogo} unoptimized width={36} height={36} alt={`${context.schoolName} logo`} className="h-full w-full object-contain" />
                : schoolMonogram}
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
              {context.schoolName}
            </span>
          </div>
          <div className="mt-6 space-y-4">
            <SetupItem number="01" title="Academic structure" description="Manage school years, branches, classes, subjects, and timetables." href="/admin/academics" />
            <SetupItem number="02" title="Student directory" description="Review admissions and manage student records." href="/admin/students" />
            <SetupItem number="03" title="Staff directory" description="Keep teaching and non-teaching staff details up to date." href="/admin/staff" />
            <SetupItem number="04" title="School profile" description="Update contact information, currency, and timezone." href="/admin/settings" />
            {(canManageFees || canRecordPayments) && (
              <SetupItem
                number="05"
                title="Fees & payments"
                description="Set up fee structures, collect payments, and review balances."
                href={canManageFees ? "/admin/fees" : "/admin/fees/collection"}
                icon={<CircleDollarSign size={19} />}
              />
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Recent activity</h2>
          <p className="mt-1 text-sm text-slate-500">Latest updates recorded for your school.</p>
          {recentActivity.length === 0 ? (
            <div className="mt-6 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
                <CircleHelp size={18} />
              </span>
              <p className="text-sm font-medium text-slate-700">No activity yet</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                Updates will appear here when administrators manage school records.
              </p>
            </div>
          ) : (
            <ol className="mt-5 divide-y divide-slate-100">
              {recentActivity.map((item, index) => (
                <li key={`${item.createdAt.toISOString()}-${index}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize text-slate-800">
                      {formatActivity(item.action, item.resourceType)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.actorName} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  color,
  href,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  color: "violet" | "blue" | "green" | "peach" | "amber";
  href: string;
}) {
  const styles = {
    violet: "bg-violet-50 text-violet-700",
    blue: "bg-sky-50 text-sky-700",
    green: "bg-emerald-50 text-emerald-700",
    peach: "bg-orange-50 text-orange-700",
    amber: "bg-amber-50 text-amber-700",
  }[color];

  return (
    <Link
      href={href}
      className="block min-w-0 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 sm:p-5"
    >
      <div className="flex min-w-0 items-start justify-between gap-1">
        <p className="min-w-0 text-xs font-medium leading-4 text-slate-500 sm:text-sm">{title}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl ${styles}`}>{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:mt-4 sm:text-3xl">{value}</p>
      <p className="mt-1 hidden text-xs text-slate-400 sm:block">{detail}</p>
    </Link>
  );
}

function formatActivity(action: string, resourceType: string) {
  const detail = action.split(".").slice(1).join(" ").replaceAll("_", " ");
  const resource = resourceType.replaceAll("_", " ");
  return `${resource} ${detail || "updated"}`;
}

function SetupItem({
  number,
  title,
  description,
  href,
  icon,
}: {
  number: string;
  title: string;
  description: string;
  href?: string;
  icon?: ReactNode;
}) {
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xs font-bold text-violet-700">
        {icon ?? number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
      {href && <ArrowUpRight size={16} className="shrink-0 text-slate-400" />}
    </>
  );

  return href ? (
    <Link href={href} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50">
      {content}
    </Link>
  ) : (
    <div className="flex items-center gap-3 rounded-xl p-2">{content}</div>
  );
}
