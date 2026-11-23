import { and, asc, count, countDistinct, desc, eq, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, ChevronLeft, ChevronRight, Users } from "lucide-react";
import type { ReactNode } from "react";
import { db } from "@/db";
import { schoolBranches, staffMembers } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { getStaffRolePagination, staffRolePageSize } from "@/lib/staff-policy";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";

const employmentTypeLabels: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
};

export default async function HumanResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[]; rolePage?: string | string[] }>;
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
  const roleCategory = sql<string>`coalesce(nullif(trim(${staffMembers.personnelRole}), ''), 'unassigned')`;
  const [statusCounts, departments, employmentTypes, [roleCategoryCountRow], recentHires] = await Promise.all([
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
      .select({ total: countDistinct(roleCategory) })
      .from(staffMembers)
      .where(staffFilter),
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
  const parsedRolePage = typeof params.rolePage === "string" && /^\d+$/.test(params.rolePage)
    ? Number(params.rolePage)
    : 1;
  const requestedRolePage = Number.isSafeInteger(parsedRolePage) && parsedRolePage > 0
    ? parsedRolePage
    : 1;
  const { page: rolePage, pageCount: rolePageCount } = getStaffRolePagination(
    Number(roleCategoryCountRow?.total ?? 0),
    requestedRolePage,
  );
  const roleBreakdown = await db
    .select({ role: roleCategory, total: count() })
    .from(staffMembers)
    .where(staffFilter)
    .groupBy(roleCategory)
    .orderBy(asc(roleCategory))
    .limit(staffRolePageSize)
    .offset((rolePage - 1) * staffRolePageSize);
  const staffHref = (options: {
    search?: string;
    profile?: string;
    showAll?: boolean;
    action?: string;
    rolePage?: number;
    role?: string;
  } = {}) => {
    const query = new URLSearchParams();
    if (options.search) query.set("search", options.search);
    if (options.profile) query.set("profile", options.profile);
    if (options.action) query.set("action", options.action);
    if (options.showAll) query.set("showAll", "1");
    if (options.rolePage) query.set("rolePage", String(options.rolePage));
    if (options.role) query.set("role", options.role);
    if (selectedBranch) query.set("branchId", String(selectedBranch.id));
    return `/admin/staff?${query.toString()}`;
  };
  const roleLabel = (role: string) => role === "unassigned"
    ? "Unassigned"
    : role.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-violet-900 to-orange-800 p-6 text-white shadow-sm sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[28px] border-white/5"
        />
        <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-violet-200">People and culture</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Human resources
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100/80">
              Staff overview for {context.schoolName}, based on records in this school.
            </p>
            {selectedBranch && (
              <p className="mt-4 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                {selectedBranch.name}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={staffHref({ action: "add", showAll: true })}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#f38020] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#df6f13] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Add staff member
              <ArrowUpRight size={16} />
            </Link>
            <Link
              href={staffHref({ showAll: true })}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Staff directory
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <section aria-label="Staff summary" className="grid grid-cols-2 gap-3">
        <SummaryCard
          href={staffHref({ showAll: true })}
          label="All staff"
          value={totalCount}
          detail="View the full staff register"
          icon={<Users size={19} />}
          iconClass="bg-violet-50 text-violet-700"
        />
        <SummaryCard
          href={staffHref({ search: "status:active" })}
          label="Active staff"
          value={activeCount}
          detail="View active staff records"
          icon={<BriefcaseBusiness size={19} />}
          iconClass="bg-emerald-50 text-emerald-700"
        />
        <SummaryCard
          href={staffHref({ search: "status:inactive" })}
          label="Inactive staff"
          value={inactiveCount}
          detail="View inactive staff records"
          icon={<Users size={19} />}
          iconClass="bg-amber-50 text-amber-700"
        />
      </section>

      <SmartFilterForm method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <SearchableSelect
          label="Branch"
          name="branchId"
          options={[
            { value: "", label: "All branches" },
            ...branches.map((branch) => ({ value: String(branch.id), label: branch.name })),
          ]}
          defaultValue={selectedBranch?.id.toString() ?? ""}
          placeholder="Search branches..."
        />
        <button className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">View branch</button>
      </SmartFilterForm>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">HR tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ToolCard href="/admin/hr/departments" title="Departments" detail="Organize staff by department and keep directory names consistent." />
          <ToolCard href="/admin/hr/designations" title="Designations" detail="Manage the job titles used for staff members." />
          <ToolCard href={staffHref({ showAll: true })} title="Staff directory" detail="Manage staff profiles, employment details, and school account links." />
          <ToolCard href="/admin/hr/attendance" title="Staff attendance records" detail="Record daily present, absent, late, and excused marks, then print the daily register." />
          <ToolCard href="/admin/hr/leave" title="Leave management" detail="Set leave types and per-person entitlement; review requests." />
          <ToolCard href="/admin/hr/payroll" title="Payroll records" detail="Calculate monthly gross and net pay, track payments, and print payroll reports." />
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
                <li key={item.department}>
                  <Link
                    href={staffHref({ search: item.department })}
                    className="group flex items-center justify-between gap-4 rounded-xl px-2 py-3 transition hover:bg-violet-50/70 first:pt-0 last:pb-0"
                  >
                    <span className="truncate text-sm font-medium text-slate-700 group-hover:text-violet-800">{item.department}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {item.total}
                      </span>
                      <ArrowUpRight size={15} className="text-violet-600 opacity-0 transition group-hover:opacity-100" />
                    </span>
                  </Link>
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
                <li key={item.employmentType}>
                  <Link
                    href={staffHref({ search: employmentTypeLabels[item.employmentType] ?? item.employmentType })}
                    className="group flex items-center justify-between gap-4 rounded-xl px-2 py-3 transition hover:bg-sky-50/70 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm font-medium text-slate-700 group-hover:text-sky-800">
                      {employmentTypeLabels[item.employmentType] ?? item.employmentType}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {item.total}
                      </span>
                      <ArrowUpRight size={15} className="text-sky-600 opacity-0 transition group-hover:opacity-100" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
              <Users size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Staff by role</h2>
              <p className="text-sm text-slate-500">Directory headcount by assigned role</p>
            </div>
          </div>
          {roleBreakdown.length === 0 ? (
            <EmptyMessage message="Add staff records to see role totals." />
          ) : (
            <>
              <ul className="mt-5 divide-y divide-slate-100">
                {roleBreakdown.map((item) => (
                  <li key={item.role}>
                    <Link
                      href={staffHref({ role: item.role, showAll: true })}
                      className="group flex items-center justify-between gap-4 rounded-xl px-2 py-3 transition hover:bg-orange-50/70 first:pt-0 last:pb-0"
                    >
                      <span className="truncate text-sm font-medium text-slate-700 group-hover:text-orange-800">
                        {roleLabel(item.role)}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {item.total}
                        </span>
                        <ArrowUpRight size={15} className="text-orange-600 opacity-0 transition group-hover:opacity-100" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {rolePageCount > 1 && (
                <nav aria-label="Staff role pages" className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <Link
                    href={staffHref({ rolePage: rolePage - 1 })}
                    aria-disabled={rolePage === 1}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium ${rolePage === 1 ? "pointer-events-none text-slate-300" : "text-violet-700 hover:bg-violet-50"}`}
                    tabIndex={rolePage === 1 ? -1 : undefined}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                    Previous
                  </Link>
                  <span className="text-xs text-slate-500">Page {rolePage} of {rolePageCount}</span>
                  <Link
                    href={staffHref({ rolePage: rolePage + 1 })}
                    aria-disabled={rolePage === rolePageCount}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium ${rolePage === rolePageCount ? "pointer-events-none text-slate-300" : "text-violet-700 hover:bg-violet-50"}`}
                    tabIndex={rolePage === rolePageCount ? -1 : undefined}
                  >
                    Next
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                </nav>
              )}
            </>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Recent starters</h2>
              <p className="mt-1 text-sm text-slate-500">Most recent start dates on file</p>
            </div>
            <Link href={staffHref({ showAll: true })} className="text-sm font-semibold text-violet-700 hover:text-violet-900">
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
                    <Link
                      href={staffHref({
                        search: `${staff.firstName} ${staff.lastName}`,
                        profile: staff.publicId,
                      })}
                      className="text-sm font-semibold text-slate-800 hover:text-violet-700"
                    >
                      {staff.firstName} {staff.lastName}
                    </Link>
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
function SummaryCard({
  href,
  label,
  value,
  detail,
  icon,
  iconClass,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
    >
      <span className="flex items-center justify-between gap-4">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>
          {icon}
        </span>
        <ArrowUpRight size={17} className="text-slate-400 transition group-hover:text-violet-700" />
      </span>
      <span className="mt-4 block text-sm font-medium text-slate-500">{label}</span>
      <span className="mt-1 block text-3xl font-bold tracking-tight text-slate-900">
        {new Intl.NumberFormat("en").format(value)}
      </span>
      <span className="mt-2 block text-xs font-medium text-slate-500">{detail}</span>
    </Link>
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