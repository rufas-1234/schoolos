import { and, asc, eq, gte, like, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  schools,
  schoolBranches,
  studentAttendance,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { resolveBranchFilterId } from "@/lib/branch-selection-policy";
import { getSchoolAcademicYearSelection } from "@/lib/academic-year-selection";
import { isCalendarDate } from "@/lib/academic-policy";
import { attendanceStatuses } from "@/lib/attendance-policy";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { PrintReportButton } from "@/app/admin/hr/reports/print-report-button";

type AttendanceTotals = Record<(typeof attendanceStatuses)[number], number>;

function isValidRange(start: string, end: string) {
  if (!isCalendarDate(start) || !isCalendarDate(end) || start > end) return false;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  return days <= 366;
}

export default async function StudentAttendanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string | string[];
    end?: string | string[];
    branchId?: string | string[];
    yearId?: string | string[];
    sectionId?: string | string[];
    status?: string | string[];
    search?: string | string[];
  }>;
}) {
  const context = await requireSchoolPermission([
    "academics.manage",
    "school.settings.manage",
    "students.view",
    "students.update",
  ]);
  const [schoolRows, branches, sections, params, academicYearSelection] = await Promise.all([
    db.select({ timezone: schools.timezone }).from(schools)
      .where(eq(schools.id, context.schoolId)).limit(1),
    db.select({
      id: schoolBranches.id,
      name: schoolBranches.name,
    }).from(schoolBranches).where(and(
      eq(schoolBranches.schoolId, context.schoolId),
      eq(schoolBranches.status, "active"),
    )).orderBy(asc(schoolBranches.name)),
    db.select({
      id: classSections.id,
      branchId: classLevels.branchId,
      academicYearId: classSections.academicYearId,
      label: classLevels.name,
      sectionName: classSections.name,
      yearName: academicYears.name,
    }).from(classSections)
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(academicYears, and(
        eq(academicYears.id, classSections.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .where(eq(classSections.schoolId, context.schoolId))
      .orderBy(asc(classLevels.name), asc(classSections.name), asc(academicYears.startDate)),
    searchParams,
    getSchoolAcademicYearSelection(context.schoolId),
  ]);
  const school = schoolRows[0];
  if (!school) throw new Error("School settings could not be loaded.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: school.timezone }).format(new Date());
  const requestedYearValue = typeof params.yearId === "string" ? params.yearId : undefined;
  const selectedYear = requestedYearValue === ""
    ? null
    : requestedYearValue === undefined
      ? academicYearSelection.selectedYear
      : academicYearSelection.years.find((year) => year.id === Number(requestedYearValue))
        ?? academicYearSelection.selectedYear;
  const defaultStart = selectedYear?.startDate ?? `${today.slice(0, 7)}-01`;
  const defaultEnd = selectedYear
    ? today < selectedYear.startDate
      ? selectedYear.endDate
      : today > selectedYear.endDate
        ? selectedYear.endDate
        : today
    : today;
  const candidateStart = typeof params.start === "string" ? params.start : "";
  const candidateEnd = typeof params.end === "string" ? params.end : "";
  const rangeValid = isValidRange(candidateStart, candidateEnd);
  const startDate = rangeValid ? candidateStart : defaultStart;
  const endDate = rangeValid ? candidateEnd : defaultEnd;
  const selectedBranchId = resolveBranchFilterId(
    branches,
    typeof params.branchId === "string" ? params.branchId : undefined,
  );
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const branchSections = sections.filter((section) =>
    (!selectedBranch || section.branchId === selectedBranch.id) &&
    (!selectedYear || section.academicYearId === selectedYear.id),
  );
  const requestedSectionId = typeof params.sectionId === "string" ? Number(params.sectionId) : NaN;
  const selectedSection = branchSections.find((section) => section.id === requestedSectionId);
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const selectedStatus = attendanceStatuses.find((status) => status === requestedStatus);
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 120) : "";

  const conditions = [
    eq(studentAttendance.schoolId, context.schoolId),
    gte(studentAttendance.attendanceDate, startDate),
    lte(studentAttendance.attendanceDate, endDate),
  ];
  if (selectedSection) conditions.push(eq(studentAttendance.classSectionId, selectedSection.id));
  if (selectedBranch) conditions.push(eq(classLevels.branchId, selectedBranch.id));
  if (selectedYear) conditions.push(eq(classSections.academicYearId, selectedYear.id));
  if (selectedStatus) conditions.push(eq(studentAttendance.status, selectedStatus));
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      like(students.firstName, pattern),
      like(students.lastName, pattern),
      like(students.admissionNumber, pattern),
    )!);
  }

  const records = await db.select({
    attendanceDate: studentAttendance.attendanceDate,
    status: studentAttendance.status,
    note: studentAttendance.note,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    className: classLevels.name,
    sectionName: classSections.name,
    yearName: academicYears.name,
  }).from(studentAttendance)
    .innerJoin(students, and(
      eq(students.id, studentAttendance.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .innerJoin(classSections, and(
      eq(classSections.id, studentAttendance.classSectionId),
      eq(classSections.schoolId, context.schoolId),
    ))
    .innerJoin(classLevels, and(
      eq(classLevels.id, classSections.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(academicYears, and(
      eq(academicYears.id, classSections.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .where(and(...conditions))
    .orderBy(asc(studentAttendance.attendanceDate), asc(classLevels.name), asc(classSections.name), asc(students.lastName), asc(students.firstName));

  const dailyTotals = new Map<string, AttendanceTotals>();
  const overall: AttendanceTotals = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const record of records) {
    if (!attendanceStatuses.includes(record.status as (typeof attendanceStatuses)[number])) continue;
    const status = record.status as keyof AttendanceTotals;
    const day = dailyTotals.get(record.attendanceDate) ?? { present: 0, absent: 0, late: 0, excused: 0 };
    day[status]++;
    overall[status]++;
    dailyTotals.set(record.attendanceDate, day);
  }

  return (
    <div className="space-y-7 print-report-page">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-violet-700">Academics</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Student attendance reports</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Review attendance marks by the date they were recorded. Only saved marks are included.
          </p>
        </div>
        <PrintReportButton title="Student attendance report" />
      </header>

      <SmartFilterForm method="get" className="print:hidden flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <SearchableSelect label="Branch" name="branchId"
          options={[
            { value: "", label: "All branches" },
            ...branches.map((branch) => ({ value: String(branch.id), label: branch.name })),
          ]}
          defaultValue={selectedBranch ? String(selectedBranch.id) : ""}
          placeholder="Search branches..." disabled={!branches.length} />
        <SearchableSelect label="Academic year" name="yearId"
          options={[
            { value: "", label: "All academic years" },
            ...academicYearSelection.years.map((year) => ({ value: String(year.id), label: year.name })),
          ]}
          defaultValue={selectedYear ? String(selectedYear.id) : ""}
          placeholder="Search academic years..." disabled={!academicYearSelection.years.length} />
        <SearchableSelect label="Class section" name="sectionId"
          options={[{ value: "", label: "All class sections" }, ...branchSections.map((section) => ({
            value: String(section.id),
            label: `${section.label} ${section.sectionName} · ${section.yearName}`,
          }))]}
          defaultValue={selectedSection ? String(selectedSection.id) : ""}
          placeholder="Search class sections..." disabled={!branchSections.length} />
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          From <input type="date" name="start" defaultValue={startDate} required
            className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          To <input type="date" name="end" defaultValue={endDate} required
            className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Status
          <select name="status" defaultValue={selectedStatus ?? ""}
            className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <option value="">All statuses</option>
            {attendanceStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Search student <input type="search" name="search" maxLength={120} defaultValue={search}
            placeholder="Name or admission number"
            className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">View report</button>
        {!rangeValid && (candidateStart || candidateEnd) && (
          <p role="status" className="basis-full text-sm text-amber-700">Choose a valid date range of up to 366 days.</p>
        )}
      </SmartFilterForm>

      <section className="print-report-content space-y-5">
        <header className="print-report-heading">
          <p className="print-report-kicker">Academics · Attendance</p>
          <h2>Student attendance by day</h2>
          <p>
            {selectedBranch ? `${selectedBranch.name} · ` : ""}{selectedYear ? `${selectedYear.name} · ` : ""}{startDate} through {endDate}
            {selectedSection ? ` · ${selectedSection.label} ${selectedSection.sectionName} · ${selectedSection.yearName}` : " · All class sections"}
            {selectedStatus ? ` · ${selectedStatus}` : ""}
            {search ? ` · Search: ${search}` : ""}
          </p>
        </header>

        <section aria-label="Attendance totals" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {attendanceStatuses.map((status) => (
            <SummaryCard key={status} label={status} value={overall[status]} />
          ))}
          <SummaryCard label="Recorded marks" value={records.length} />
        </section>

        <section className="print-report-panel overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Daily attendance summary</h2>
            <p className="mt-1 text-sm text-slate-500">Each date represents attendance records saved for that day.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="print-report-table w-full min-w-[38rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Attendance date</th>
                  {attendanceStatuses.map((status) => <th key={status} className="px-4 py-3 font-semibold capitalize">{status}</th>)}
                  <th className="px-4 py-3 font-semibold">Total marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...dailyTotals.entries()].map(([date, totals]) => (
                  <tr key={date}>
                    <td className="px-5 py-3 font-medium text-slate-800">{date}</td>
                    {attendanceStatuses.map((status) => <td key={status} className="px-4 py-3 text-slate-600">{totals[status]}</td>)}
                    <td className="px-4 py-3 font-medium text-slate-800">{Object.values(totals).reduce((sum, total) => sum + total, 0)}</td>
                  </tr>
                ))}
                {dailyTotals.size === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No attendance marks were recorded for these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="print-report-panel overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Attendance record details</h2>
            <p className="mt-1 text-sm text-slate-500">{records.length} saved attendance marks, listed by date.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="print-report-table w-full min-w-[54rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Admission number</th>
                  <th className="px-4 py-3 font-semibold">Class section</th>
                  <th className="px-4 py-3 font-semibold">Academic year</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record, index) => (
                  <tr key={`${record.attendanceDate}-${record.admissionNumber}-${index}`}>
                    <td className="px-4 py-3">{record.attendanceDate}</td>
                    <td className="px-4 py-3 font-medium">{record.firstName} {record.lastName}</td>
                    <td className="px-4 py-3">{record.admissionNumber}</td>
                    <td className="px-4 py-3">{record.className} {record.sectionName}</td>
                    <td className="px-4 py-3">{record.yearName}</td>
                    <td className="px-4 py-3 capitalize">{record.status}</td>
                    <td className="px-4 py-3">{record.note ?? "—"}</td>
                  </tr>
                ))}
                {records.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No attendance marks were recorded for these filters.</td></tr>}
              </tbody>
            </table>
          </div>
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
