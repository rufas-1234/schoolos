import Link from "next/link";
import { and, asc, count, eq, gte, like, lte, or } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { db } from "@/db";
import {
  dormitories,
  dormitoryRooms,
  schoolBranches,
  studentDormitoryAssignments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";

type ReportSearchParams = {
  report?: string | string[];
  dormitoryId?: string | string[];
  status?: string | string[];
  search?: string | string[];
  start?: string | string[];
  end?: string | string[];
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseId(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : -1;
}

function parseDate(value: string): string | undefined {
  return isCalendarDate(value) ? value : undefined;
}

export default async function DormitoryReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>;
}) {
  const context = await requireSchoolPermission("dormitories.manage");
  const query = await searchParams;
  const report = first(query.report) === "history" ? "history" : "occupancy";
  const dormitoryIdText = first(query.dormitoryId);
  const dormitoryId = parseId(dormitoryIdText);
  const requestedStatus = first(query.status);
  const status = ["active", "completed", "all"].includes(requestedStatus) ? requestedStatus : "all";
  const search = first(query.search).trim().slice(0, 120);
  const rawStart = first(query.start);
  const rawEnd = first(query.end);
  const parsedStart = parseDate(rawStart);
  const parsedEnd = parseDate(rawEnd);
  const validDateRange = (!rawStart || Boolean(parsedStart)) &&
    (!rawEnd || Boolean(parsedEnd)) &&
    (!parsedStart || !parsedEnd || parsedStart <= parsedEnd);
  const start = validDateRange ? parsedStart : undefined;
  const end = validDateRange ? parsedEnd : undefined;
  const dormitoryList = await db.select({
    id: dormitories.id,
    name: dormitories.name,
  }).from(dormitories).where(and(
    eq(dormitories.schoolId, context.schoolId),
    eq(dormitories.status, "active"),
  )).orderBy(asc(dormitories.name));
  const searchPattern = `%${search}%`;
  const [rooms, occupancyRows] = report === "occupancy" ? await Promise.all([
    db.select({
      id: dormitoryRooms.id,
      dormitory: dormitories.name,
      room: dormitoryRooms.roomNumber,
      capacity: dormitoryRooms.capacity,
      branch: schoolBranches.name,
    }).from(dormitoryRooms)
      .innerJoin(dormitories, and(
        eq(dormitories.id, dormitoryRooms.dormitoryId),
        eq(dormitories.schoolId, context.schoolId),
      ))
      .leftJoin(schoolBranches, and(
        eq(schoolBranches.id, dormitories.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .where(and(
        eq(dormitoryRooms.schoolId, context.schoolId),
        eq(dormitoryRooms.status, "active"),
        eq(dormitories.status, "active"),
        dormitoryId ? eq(dormitories.id, dormitoryId) : undefined,
        search ? or(
          like(dormitories.name, searchPattern),
          like(dormitoryRooms.roomNumber, searchPattern),
          like(schoolBranches.name, searchPattern),
        ) : undefined,
      ))
      .orderBy(asc(dormitories.name), asc(dormitoryRooms.roomNumber)),
    db.select({
      roomId: studentDormitoryAssignments.roomId,
      occupied: count(),
    }).from(studentDormitoryAssignments).where(and(
      eq(studentDormitoryAssignments.schoolId, context.schoolId),
      eq(studentDormitoryAssignments.status, "active"),
    )).groupBy(studentDormitoryAssignments.roomId),
  ]) : [[], []];
  const historyRows = report === "history" && validDateRange
    ? await db.select({
      id: studentDormitoryAssignments.id,
      student: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      dormitory: dormitories.name,
      room: dormitoryRooms.roomNumber,
      assignedAt: studentDormitoryAssignments.assignedAt,
      leftAt: studentDormitoryAssignments.leftAt,
      status: studentDormitoryAssignments.status,
    }).from(studentDormitoryAssignments)
      .innerJoin(students, and(
        eq(students.id, studentDormitoryAssignments.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .innerJoin(dormitoryRooms, and(
        eq(dormitoryRooms.id, studentDormitoryAssignments.roomId),
        eq(dormitoryRooms.schoolId, context.schoolId),
      ))
      .innerJoin(dormitories, and(
        eq(dormitories.id, dormitoryRooms.dormitoryId),
        eq(dormitories.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentDormitoryAssignments.schoolId, context.schoolId),
        dormitoryId ? eq(dormitories.id, dormitoryId) : undefined,
        status === "all" ? undefined : eq(studentDormitoryAssignments.status, status),
        start ? gte(studentDormitoryAssignments.assignedAt, start) : undefined,
        end ? lte(studentDormitoryAssignments.assignedAt, end) : undefined,
        search ? or(
          like(students.firstName, searchPattern),
          like(students.lastName, searchPattern),
          like(students.admissionNumber, searchPattern),
          like(dormitories.name, searchPattern),
          like(dormitoryRooms.roomNumber, searchPattern),
        ) : undefined,
      ))
      .orderBy(asc(dormitories.name), asc(dormitoryRooms.roomNumber), asc(students.lastName))
    : [];
  const occupancyByRoom = new Map(occupancyRows.map((row) => [row.roomId, Number(row.occupied)]));
  const roomReportRows = rooms.map((room) => {
    const occupied = occupancyByRoom.get(room.id) ?? 0;
    return {
      ...room,
      occupied,
      available: Math.max(0, room.capacity - occupied),
    };
  });
  const title = report === "history" ? "Room assignment history" : "Dormitory occupancy report";

  return <main className="print-report-page min-w-0 space-y-5 p-3 sm:space-y-6 sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div>
        <p className="text-sm font-semibold text-violet-700">Dormitory management</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">Review occupancy and student room assignment history.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/dormitories?section=overview" className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Dormitory overview</Link>
        <PrintButton label="Print report" pageOrientation="landscape" />
      </div>
    </header>

    <SmartFilterForm method="get" className="print:hidden grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
      <div className="max-w-xs"><SearchableSelect label="Report" name="report" defaultValue={report}
        options={[
          { value: "occupancy", label: "Occupancy" },
          { value: "history", label: "Assignment history" },
        ]} placeholder="Search reports..." /></div>
      <div className="max-w-xs"><SearchableSelect label="Dormitory" name="dormitoryId" defaultValue={dormitoryIdText}
        options={[{ value: "", label: "All dormitories" }, ...dormitoryList.map((item) => ({ value: String(item.id), label: item.name }))]}
        placeholder="Search dormitories..." /></div>
      {report === "history" && <>
        <div className="max-w-xs"><SearchableSelect label="Assignment status" name="status" defaultValue={status}
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Current residents" },
            { value: "completed", label: "Checked out" },
          ]} placeholder="Search statuses..." /></div>
        <label className="block text-sm font-medium text-slate-700">From
          <input type="date" name="start" defaultValue={start ?? ""} max={end ?? undefined}
            className="mt-1 h-11 w-full max-w-xs rounded-lg border border-slate-200 px-3" />
        </label>
        <label className="block text-sm font-medium text-slate-700">To
          <input type="date" name="end" defaultValue={end ?? ""} min={start ?? undefined}
            className="mt-1 h-11 w-full max-w-xs rounded-lg border border-slate-200 px-3" />
        </label>
      </>}
      <label className="block min-w-0 text-sm font-medium text-slate-700">Search
        <input type="search" name="search" defaultValue={search} placeholder="Student, dormitory, or room"
          className="mt-1 h-11 w-full max-w-sm min-w-0 rounded-lg border border-slate-200 px-3 text-sm" />
      </label>
      <div className="flex items-end gap-3">
        <button className="h-11 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white">View report</button>
        <Link href={`/admin/dormitories/reports?report=${report}`} className="text-sm font-medium text-violet-700">Clear</Link>
      </div>
    </SmartFilterForm>

    <section className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 print:rounded-none print:border-0 print:p-0">
      <header className="print-report-heading">
        <p className="print-report-kicker">Dormitory management · Reports</p>
        <h2>{title}</h2>
        <p>
          {dormitoryId ? dormitoryList.find((item) => item.id === dormitoryId)?.name ?? "Selected dormitory" : "All dormitories"}
          {search ? ` · Search: ${search}` : ""}
          {report === "history" ? ` · ${status === "all" ? "All statuses" : status} · ${start ?? "Any start"} to ${end ?? "Today"}` : ""}
          {` · ${report === "history" ? historyRows.length : roomReportRows.length} records`}
        </p>
      </header>
      {!validDateRange && <p role="alert" className="text-sm text-rose-700">Enter valid calendar dates, with the start date on or before the end date.</p>}
      {report === "occupancy" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Rooms" value={roomReportRows.length} />
            <SummaryCard label="Bed capacity" value={roomReportRows.reduce((total, room) => total + room.capacity, 0)} />
            <SummaryCard label="Occupied beds" value={roomReportRows.reduce((total, room) => total + room.occupied, 0)} />
            <SummaryCard label="Available beds" value={roomReportRows.reduce((total, room) => total + room.available, 0)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Dormitory</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Room</th><th className="px-4 py-3">Capacity</th><th className="px-4 py-3">Occupied</th><th className="px-4 py-3">Available</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roomReportRows.map((room) => <tr key={room.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{room.dormitory}</td>
                  <td className="px-4 py-3 text-slate-700">{room.branch ?? "All branches"}</td>
                  <td className="px-4 py-3 text-slate-700">{room.room}</td>
                  <td className="px-4 py-3 text-slate-700">{room.capacity}</td>
                  <td className="px-4 py-3 text-slate-700">{room.occupied}</td>
                  <td className="px-4 py-3 text-slate-700">{room.available}</td>
                </tr>)}
                {!roomReportRows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No rooms match this report.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Admission no.</th><th className="px-4 py-3">Dormitory</th><th className="px-4 py-3">Room</th><th className="px-4 py-3">Move-in</th><th className="px-4 py-3">Checkout</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyRows.map((assignment) => <tr key={assignment.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{assignment.student} {assignment.lastName}</td>
                <td className="px-4 py-3 text-slate-700">{assignment.admissionNumber ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{assignment.dormitory}</td>
                <td className="px-4 py-3 text-slate-700">{assignment.room}</td>
                <td className="px-4 py-3 text-slate-700">{assignment.assignedAt}</td>
                <td className="px-4 py-3 text-slate-700">{assignment.leftAt ?? "—"}</td>
                <td className="px-4 py-3 capitalize text-slate-700">{assignment.status}</td>
              </tr>)}
              {!historyRows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No assignments match this report.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </main>;
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <article className="rounded-xl border border-slate-200 p-3">
    <p className="text-sm text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
  </article>;
}
