import { and, asc, eq, isNull, like, or } from "drizzle-orm";
import { db } from "@/db";
import { schoolBranches, schools, staffAttendance, staffMembers } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { parseStaffRoleFilter } from "@/lib/hr-policy";
import { staffRoles } from "@/lib/staff-policy";
import { SearchableSelect } from "@/components/searchable-select";
import { AttendanceForm, BulkAttendanceForm, StaffAttendanceSelectAll } from "../hr-forms";
import { PrintReportButton } from "../reports/print-report-button";

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[]; branchId?: string | string[]; role?: string | string[]; search?: string | string[] }>;
}) {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const params = await searchParams;
  const requestedDate = typeof params.date === "string" && isCalendarDate(params.date)
    ? params.date
    : undefined;
  const [school, branches] = await Promise.all([
    db.select({ timezone: schools.timezone })
      .from(schools).where(eq(schools.id, context.schoolId)).limit(1),
    db.select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code })
      .from(schoolBranches)
      .where(and(
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ))
      .orderBy(asc(schoolBranches.name)),
  ]);
  const schoolSettings = school[0];
  if (!schoolSettings) throw new Error("School settings could not be loaded.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: schoolSettings.timezone }).format(new Date());
  const requestedBranchId = typeof params.branchId === "string" ? Number(params.branchId) : NaN;
  const branchId = branches.some((branch) => branch.id === requestedBranchId)
    ? requestedBranchId
    : branches[0]?.id;
  const requestedRole = typeof params.role === "string" ? params.role : "";
  const selectedRole = parseStaffRoleFilter(requestedRole);
  const staffSearch = typeof params.search === "string" ? params.search.trim().slice(0, 120) : "";
  const attendanceDate = requestedDate ?? today;
  const staffConditions = [
    eq(staffMembers.schoolId, context.schoolId),
    eq(staffMembers.status, "active"),
  ];
  if (branchId) staffConditions.push(eq(staffMembers.branchId, branchId));
  if (staffSearch) {
    const pattern = `%${staffSearch}%`;
    staffConditions.push(or(
      like(staffMembers.firstName, pattern),
      like(staffMembers.lastName, pattern),
      like(staffMembers.employeeCode, pattern),
    )!);
  }
  if (selectedRole === "unassigned") staffConditions.push(isNull(staffMembers.personnelRole));
  else if (selectedRole !== "all") staffConditions.push(eq(staffMembers.personnelRole, selectedRole));
  const attendanceConditions = [
    eq(staffAttendance.schoolId, context.schoolId),
    eq(staffAttendance.attendanceDate, attendanceDate),
  ];
  if (branchId) attendanceConditions.push(eq(staffMembers.branchId, branchId));
  if (staffSearch) {
    const pattern = `%${staffSearch}%`;
    attendanceConditions.push(or(
      like(staffMembers.firstName, pattern),
      like(staffMembers.lastName, pattern),
      like(staffMembers.employeeCode, pattern),
    )!);
  }
  if (selectedRole === "unassigned") attendanceConditions.push(isNull(staffMembers.personnelRole));
  else if (selectedRole !== "all") attendanceConditions.push(eq(staffMembers.personnelRole, selectedRole));
  const [staff, marks] = await Promise.all([
    db.select({
      id: staffMembers.id,
      firstName: staffMembers.firstName,
      lastName: staffMembers.lastName,
      employeeCode: staffMembers.employeeCode,
      personnelRole: staffMembers.personnelRole,
      department: staffMembers.department,
      jobTitle: staffMembers.jobTitle,
    }).from(staffMembers)
      .where(and(...staffConditions))
      .orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db.select({
      staffId: staffAttendance.staffId,
      status: staffAttendance.status,
      note: staffAttendance.note,
    }).from(staffAttendance)
      .innerJoin(staffMembers, and(
        eq(staffAttendance.staffId, staffMembers.id),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .where(and(...attendanceConditions)),
  ]);
  const byStaff = new Map(marks.map((mark) => [mark.staffId, mark]));
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const mark of marks) {
    if (mark.status in counts) counts[mark.status as keyof typeof counts]++;
  }

  return (
    <div className="space-y-7 print-report-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
        <p className="text-sm font-medium text-violet-700">Human resources</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Staff attendance records</h1>
        <p className="mt-2 text-sm text-slate-500">
          Record daily attendance for active staff. A saved mark can be updated for that date.
        </p>
        </div>
        <PrintReportButton />
      </header>

      <form method="get" className="print:hidden flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <SearchableSelect
          label="Branch"
          name="branchId"
          options={branches.map((branch) => ({ value: String(branch.id), label: branch.name }))}
          required
          defaultValue={branchId?.toString() ?? ""}
          placeholder="Search branches..."
          disabled={!branches.length}
        />
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Attendance date
          <input type="date" name="date" defaultValue={attendanceDate} required className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
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
        <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">View date</button>
      </form>

      <section aria-label="Attendance summary" className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <SummaryCard label="Present" value={counts.present} />
        <SummaryCard label="Absent" value={counts.absent} />
        <SummaryCard label="Late" value={counts.late} />
        <SummaryCard label="Excused" value={counts.excused} />
      </section>

      {!branches.length && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Create an active branch before recording staff attendance.</p>}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">
            Attendance for {branches.find((branch) => branch.id === branchId)?.name ?? "selected branch"} · {attendanceDate}
            {selectedRole !== "all" && ` · ${selectedRole === "unassigned" ? "Unassigned role" : selectedRole}`}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{staff.length} active staff members</p>
          {branchId && staff.length > 0 && (
            <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 p-4 print:hidden">
              <p className="mb-3 text-xs text-slate-600">Select one or more staff members below to bulk mark them present, absent, late, or excused.</p>
              <StaffAttendanceSelectAll />
              <BulkAttendanceForm branchId={branchId} attendanceDate={attendanceDate} />
            </div>
          )}
        </div>
        {staff.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Add active staff members before recording attendance.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {staff.map((member) => {
              const mark = byStaff.get(member.id);
              return (
                <li key={member.id} className="grid gap-3 p-4 sm:grid-cols-[auto_minmax(12rem,1fr)_minmax(18rem,2fr)] sm:items-center">
                  <label className="flex items-center gap-2 text-xs text-slate-500 print:hidden">
                    <input
                      type="checkbox"
                      name="staffIds"
                      value={member.id}
                      form="staff-attendance-bulk-form"
                      aria-label={`Select ${member.firstName} ${member.lastName} for bulk attendance`}
                      className="size-4 rounded border-slate-300 text-violet-700 focus:ring-violet-500"
                    />
                    <span className="sm:sr-only">Select</span>
                  </label>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {member.firstName} {member.lastName}
                      {member.employeeCode && <span className="ml-2 text-xs font-normal text-slate-400">{member.employeeCode}</span>}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {[member.personnelRole, member.jobTitle, member.department].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <AttendanceForm
                    staffId={member.id}
                    branchId={branchId ?? 0}
                    attendanceDate={attendanceDate}
                    status={mark?.status}
                    note={mark?.note}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="attendance-print-only print-report-content space-y-5">
        <header className="print-report-heading">
          <p className="print-report-kicker">Human resources · Attendance register</p>
          <h2>Staff attendance records</h2>
          <p>
            {branches.find((branch) => branch.id === branchId)?.name ?? "All branches"} · {attendanceDate}
            {selectedRole !== "all" ? ` · ${selectedRole === "unassigned" ? "Unassigned role" : selectedRole}` : " · All staff roles"}
          </p>
        </header>
        <section className="print-report-panel overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="print-report-table w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3">Staff member</th>
                <th className="px-4 py-3">Employee ID</th>
                <th className="px-4 py-3">Role / department</th>
                <th className="px-4 py-3">Attendance status</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Signature</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => {
                const mark = byStaff.get(member.id);
                return (
                  <tr key={member.id}>
                    <td className="px-4 py-3 font-medium">{member.firstName} {member.lastName}</td>
                    <td className="px-4 py-3">{member.employeeCode ?? "—"}</td>
                    <td className="px-4 py-3">{[member.personnelRole, member.department].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-4 py-3 capitalize">{mark?.status ?? "Not recorded"}</td>
                    <td className="px-4 py-3">{mark?.note ?? "—"}</td>
                    <td className="px-4 py-3"><span className="block h-6 min-w-24 border-b border-slate-400" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {staff.length === 0 && <p className="p-6 text-center text-sm">No staff members match these filters.</p>}
        </section>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></article>;
}
