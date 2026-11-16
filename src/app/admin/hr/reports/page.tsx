import Link from "next/link";
import { and, asc, eq, gte, isNull, like, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { schoolBranches, schools, staffAttendance, staffMembers } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isValidStaffReportRange, parseStaffRoleFilter, staffAttendanceStatuses } from "@/lib/hr-policy";
import { staffRoles } from "@/lib/staff-policy";
import { PrintReportButton } from "./print-report-button";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";

type AttendanceTotals = Record<(typeof staffAttendanceStatuses)[number], number>;

export default async function StaffReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string | string[]; end?: string | string[]; branchId?: string | string[]; role?: string | string[]; search?: string | string[] }>;
}) {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const [schoolResult, branches, params] = await Promise.all([
    db.select({ timezone: schools.timezone })
      .from(schools).where(eq(schools.id, context.schoolId)).limit(1),
    db.select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code })
      .from(schoolBranches)
      .where(and(
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ))
      .orderBy(asc(schoolBranches.name)),
    searchParams,
  ]);
  const school = schoolResult[0];
  if (!school) throw new Error("School settings could not be loaded.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: school.timezone }).format(new Date());
  const defaultStart = `${today.slice(0, 7)}-01`;
  const requestedBranchId = typeof params.branchId === "string" ? Number(params.branchId) : NaN;
  const branch = branches.find((item) => item.id === requestedBranchId) ?? branches[0];
  const branchId = branch?.id;
  const requestedRole = typeof params.role === "string" ? params.role : "";
  const selectedRole = parseStaffRoleFilter(requestedRole);
  const staffSearch = typeof params.search === "string" ? params.search.trim().slice(0, 120) : "";
  const startCandidate = typeof params.start === "string" ? params.start : "";
  const endCandidate = typeof params.end === "string" ? params.end : "";
  const requestedRangeValid = isValidStaffReportRange(startCandidate, endCandidate);
  const startDate = requestedRangeValid ? startCandidate : defaultStart;
  const endDate = requestedRangeValid ? endCandidate : today;

  const staffConditions = [
    eq(staffMembers.schoolId, context.schoolId),
    eq(staffMembers.branchId, branchId ?? 0),
  ];
  const markConditions = [
    eq(staffAttendance.schoolId, context.schoolId),
    gte(staffAttendance.attendanceDate, startDate),
    lte(staffAttendance.attendanceDate, endDate),
    eq(staffMembers.branchId, branchId ?? 0),
  ];
  if (selectedRole === "unassigned") {
    staffConditions.push(isNull(staffMembers.personnelRole));
    markConditions.push(isNull(staffMembers.personnelRole));
  } else if (selectedRole !== "all") {
    staffConditions.push(eq(staffMembers.personnelRole, selectedRole));
    markConditions.push(eq(staffMembers.personnelRole, selectedRole));
  }
  if (staffSearch) {
    const pattern = `%${staffSearch}%`;
    staffConditions.push(or(
      like(staffMembers.firstName, pattern),
      like(staffMembers.lastName, pattern),
      like(staffMembers.employeeCode, pattern),
    )!);
    markConditions.push(or(
      like(staffMembers.firstName, pattern),
      like(staffMembers.lastName, pattern),
      like(staffMembers.employeeCode, pattern),
    )!);
  }
  const [staff, marks] = await Promise.all([
    db.select({
      id: staffMembers.id,
      firstName: staffMembers.firstName,
      lastName: staffMembers.lastName,
      employeeCode: staffMembers.employeeCode,
      department: staffMembers.department,
      jobTitle: staffMembers.jobTitle,
      personnelRole: staffMembers.personnelRole,
      status: staffMembers.status,
    }).from(staffMembers)
      .where(and(...staffConditions))
      .orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db.select({
      staffId: staffAttendance.staffId,
      status: staffAttendance.status,
    }).from(staffAttendance)
      .innerJoin(staffMembers, and(
        eq(staffAttendance.staffId, staffMembers.id),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .where(and(...markConditions)),
  ]);

  const zeroTotals = (): AttendanceTotals => ({ present: 0, absent: 0, late: 0, excused: 0 });
  const totalsByStaff = new Map<number, AttendanceTotals>();
  const overall = zeroTotals();
  for (const mark of marks) {
    if (!staffAttendanceStatuses.includes(mark.status as (typeof staffAttendanceStatuses)[number])) continue;
    const status = mark.status as keyof AttendanceTotals;
    const totals = totalsByStaff.get(mark.staffId) ?? zeroTotals();
    totals[status]++;
    overall[status]++;
    totalsByStaff.set(mark.staffId, totals);
  }
  const markedCount = staff.reduce((total, member) => {
    const counts = totalsByStaff.get(member.id);
    return total + (counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : 0);
  }, 0);

  return (
    <div className="space-y-7 print-report-page">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-violet-700">Human resources</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Staff attendance reports</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Review recorded staff attendance for a date range. Only saved attendance marks are counted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/hr" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            HR overview
          </Link>
          <PrintReportButton />
        </div>
      </header>

      <SmartFilterForm method="get" className="print:hidden flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <SearchableSelect
          label="Branch"
          name="branchId"
          options={branches.map((item) => ({ value: String(item.id), label: `${item.name} (${item.code})` }))}
          required
          defaultValue={branchId?.toString() ?? ""}
          placeholder="Search branches..."
          disabled={!branches.length}
        />
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          From
          <input type="date" name="start" defaultValue={startDate} required className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          To
          <input type="date" name="end" defaultValue={endDate} required className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Staff role
          <select name="role" defaultValue={selectedRole} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <option value="all">All roles</option>
            {staffRoles.map((role) => (
              <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>
            ))}
            <option value="unassigned">Unassigned role</option>
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Search staff
          <input type="search" name="search" maxLength={120} defaultValue={staffSearch} placeholder="Name or staff number" className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">View report</button>
        {!requestedRangeValid && (startCandidate || endCandidate) && (
          <p role="status" className="basis-full text-sm text-amber-700">Choose a valid date range of up to 367 days.</p>
        )}
      </SmartFilterForm>

      <section className="print-report-content space-y-5">
        <header className="print-report-heading">
          <p className="print-report-kicker">Human resources · Attendance</p>
          <h2>Staff attendance records report</h2>
          <p>
            {branch ? `${branch.name} · ` : ""}{startDate} through {endDate}
            {selectedRole !== "all" ? ` · ${selectedRole === "unassigned" ? "Unassigned role" : selectedRole}` : " · All staff roles"}
            {staffSearch ? ` · Search: ${staffSearch}` : ""}
            {` · ${staff.length} staff members`}
          </p>
        </header>
        <section aria-label="Attendance totals" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {staffAttendanceStatuses.map((status) => (
            <SummaryCard key={status} label={status} value={overall[status]} />
          ))}
          <SummaryCard label="Total marks" value={markedCount} />
        </section>

        <section className="print-report-panel overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Attendance by staff member</h2>
            <p className="mt-1 text-sm text-slate-500">{branch ? `${branch.name} · ` : ""}{startDate} to {endDate} · {staff.length} staff members</p>
          </div>
          {staff.length === 0 ? (
            <p className="p-7 text-center text-sm text-slate-500">No staff records are available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="print-report-table w-full min-w-[46rem] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Staff member</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Present</th>
                    <th className="px-4 py-3 font-semibold">Absent</th>
                    <th className="px-4 py-3 font-semibold">Late</th>
                    <th className="px-4 py-3 font-semibold">Excused</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staff.map((member) => {
                    const totals = totalsByStaff.get(member.id) ?? zeroTotals();
                    return (
                      <tr key={member.id}>
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-800">{member.firstName} {member.lastName}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {[member.employeeCode, member.jobTitle, member.status].filter(Boolean).join(" · ")}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{member.department}</td>
                        <td className="px-4 py-3 capitalize text-slate-600">{member.personnelRole ?? "Unassigned"}</td>
                        <td className="px-4 py-3 text-slate-600">{totals.present}</td>
                        <td className="px-4 py-3 text-slate-600">{totals.absent}</td>
                        <td className="px-4 py-3 text-slate-600">{totals.late}</td>
                        <td className="px-4 py-3 text-slate-600">{totals.excused}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium capitalize text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}
