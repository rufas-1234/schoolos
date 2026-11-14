import { and, asc, count, desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, Users } from "lucide-react";
import { db } from "@/db";
import { schoolBranches, staffMembers } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

const employmentTypeLabels: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
};

export default async function HumanResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const [branches, params] = await Promise.all([
    db.select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code })
      .from(schoolBranches)
      .where(and(
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ))
      .orderBy(asc(schoolBranches.name)),
    searchParams,
  ]);
  const requestedBranchId = typeof params.branchId === "string" ? Number(params.branchId) : NaN;
  const selectedBranch = branches.find((branch) => branch.id === requestedBranchId);
  const staffFilter = and(
    eq(staffMembers.schoolId, context.schoolId),
    ...(selectedBranch ? [eq(staffMembers.branchId, selectedBranch.id)] : []),
  );
  const [statusCounts, departments, employmentTypes, recentHires] = await Promise.all([
    db
      .select({ status: staffMembers.status, total: count() })
      .from(staffMembers)
      .where(staffFilter)
      .groupBy(staffMembers.status),
    db
      .select({ department: staffMembers.department, total: count() })
      .from(staffMembers)
      .where(staffFilter)
      .groupBy(staffMembers.department)
      .orderBy(asc(staffMembers.department)),
    db
      .select({ employmentType: staffMembers.employmentType, total: count() })
      .from(staffMembers)
      .where(staffFilter)
      .groupBy(staffMembers.employmentType)
      .orderBy(asc(staffMembers.employmentType)),
    db
      .select({
        publicId: staffMembers.publicId,
        firstName: staffMembers.firstName,
        lastName: staffMembers.lastName,
        jobTitle: staffMembers.jobTitle,
        department: staffMembers.department,
        startDate: staffMembers.startDate,
      })
      .from(staffMembers)
      .where(and(staffFilter, isNotNull(staffMembers.startDate)))
      .orderBy(desc(staffMembers.startDate), asc(staffMembers.lastName))
      .limit(5),
  ]);
  const activeCount = statusCounts.find((item) => item.status === "active")?.total ?? 0;
  const inactiveCount = statusCounts.find((item) => item.status === "inactive")?.total ?? 0;
  const totalCount = statusCounts.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-violet-700">People</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Human resources
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Staff overview for {context.schoolName}, based on records in this school.
          </p>
        </div>
        <Link
          href="/admin/staff"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800"
        >
          Manage staff
          <ArrowUpRight size={16} />
        </Link>
      </header>

      <section aria-label="Staff summary" className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="All staff" value={totalCount} />
        <SummaryCard label="Active" value={activeCount} />
        <SummaryCard label="Inactive" value={inactiveCount} />
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Branch
          <select name="branchId" defaultValue={selectedBranch?.id.toString() ?? ""} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <option value="">All branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <button className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">View branch</button>
      </form>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">HR tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ToolCard href="/admin/hr/departments" title="Departments" detail="Organize staff by department and keep directory names consistent." />
          <ToolCard href="/admin/hr/designations" title="Designations" detail="Manage the job titles used for staff members." />
          <ToolCard href="/admin/staff" title="Staff directory" detail="Manage staff profiles, employment details, and school account links." />
          <ToolCard href="/admin/hr/attendance" title="Staff attendance" detail="Record daily present, absent, late, and excused marks." />
          <ToolCard href="/admin/hr/leave" title="Leave management" detail="Set leave types and per-person entitlement; review requests." />
          <ToolCard href="/admin/hr/payroll" title="Payroll records" detail="Record paid or outstanding amounts and view period totals." />
          <ToolCard href="/admin/hr/reports" title="Staff reports" detail="Review attendance totals for a selected date range and print the report." />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
              <BriefcaseBusiness size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Staff by department</h2>
              <p className="text-sm text-slate-500">Current directory headcount</p>
            </div>
          </div>
          {departments.length === 0 ? (
            <EmptyMessage message="Add staff records to see department totals." />
          ) : (
            <ul className="mt-5 divide-y divide-slate-100">
              {departments.map((item) => (
                <li key={item.department} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="truncate text-sm font-medium text-slate-700">{item.department}</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {item.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Users size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Employment types</h2>
              <p className="text-sm text-slate-500">Current directory breakdown</p>
            </div>
          </div>
          {employmentTypes.length === 0 ? (
            <EmptyMessage message="Add staff records to see employment totals." />
          ) : (
            <ul className="mt-5 divide-y divide-slate-100">
              {employmentTypes.map((item) => (
                <li key={item.employmentType} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium text-slate-700">
                    {employmentTypeLabels[item.employmentType] ?? item.employmentType}
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {item.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Recent starters</h2>
              <p className="mt-1 text-sm text-slate-500">Most recent start dates on file</p>
            </div>
            <Link href="/admin/staff" className="text-sm font-semibold text-violet-700 hover:text-violet-900">
              Staff directory
            </Link>
          </div>
          {recentHires.length === 0 ? (
            <EmptyMessage message="No staff start dates have been recorded yet." />
          ) : (
            <ul className="mt-5 divide-y divide-slate-100">
              {recentHires.map((staff) => (
                <li key={staff.publicId} className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {staff.firstName} {staff.lastName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {staff.jobTitle} · {staff.department}
                    </p>
                  </div>
                  <time dateTime={staff.startDate ?? undefined} className="text-xs font-medium text-slate-500">
                    {staff.startDate
                      ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                          new Date(`${staff.startDate}T00:00:00`),
                        )
                      : ""}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}
function EmptyMessage({ message }: { message: string }) {
  return (
    <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      {message}
    </p>
  );
}

function ToolCard({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-violet-200 hover:shadow-md">
      <span className="flex items-center justify-between gap-3">
        <span className="font-semibold text-slate-800">{title}</span>
        <ArrowUpRight size={16} className="shrink-0 text-violet-700" />
      </span>
      <span className="mt-2 block text-sm leading-5 text-slate-500">{detail}</span>
    </Link>
  );
}