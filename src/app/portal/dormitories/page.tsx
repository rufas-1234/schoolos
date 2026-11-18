import Link from "next/link";
import { and, asc, count, desc, eq, inArray, like, or } from "drizzle-orm";
import { BedDouble, Building2, CircleAlert, UsersRound } from "lucide-react";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { TablePagination } from "@/components/table-pagination";
import { parsePageSize } from "@/components/pagination-utils";
import { ManagementPortalShell } from "@/app/portal/management-portal-shell";
import { db } from "@/db";
import {
  dormitories,
  dormitoryRooms,
  studentDormitoryAssignments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  BulkStudentRoomAssignmentForm,
  EndRoomAssignmentButton,
  StudentRoomAssignmentForm,
} from "@/app/admin/dormitories/dormitory-forms";

export const dynamic = "force-dynamic";

type SearchParams = {
  section?: string;
  search?: string;
  page?: string;
  pageSize?: string;
};

function validPage(value: string | undefined): number {
  return value && /^\d+$/.test(value) && Number(value) > 0
    ? Math.min(Number(value), 100000)
    : 1;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function DormitoryPortalPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [context, query] = await Promise.all([
    requireSchoolPermission("dormitories.manage"),
    searchParams,
  ]);
  const section = query.section === "residents" ? "residents" : "overview";
  const search = (query.search ?? "").trim().slice(0, 120);
  const pageSize = parsePageSize(query.pageSize);
  const requestedPage = validPage(query.page);
  const schoolId = context.schoolId;
  const today = todayDate();
  const pattern = `%${search}%`;
  const residentFilter = and(
    eq(studentDormitoryAssignments.schoolId, schoolId),
    eq(studentDormitoryAssignments.status, "active"),
    eq(dormitoryRooms.schoolId, schoolId),
    eq(dormitoryRooms.status, "active"),
    eq(dormitories.schoolId, schoolId),
    eq(dormitories.status, "active"),
    eq(students.schoolId, schoolId),
    search ? or(
      like(students.firstName, pattern),
      like(students.lastName, pattern),
      like(students.admissionNumber, pattern),
      like(dormitories.name, pattern),
      like(dormitoryRooms.roomNumber, pattern),
    ) : undefined,
  );

  const [
    dormitoryRows,
    roomRows,
    occupancyRows,
    assignmentIds,
    studentRows,
    [totalAssignments],
    [residentCount],
    residentRows,
  ] = await Promise.all([
    db.select({ id: dormitories.id, name: dormitories.name }).from(dormitories)
      .where(and(eq(dormitories.schoolId, schoolId), eq(dormitories.status, "active")))
      .orderBy(asc(dormitories.name)),
    db.select({
      id: dormitoryRooms.id,
      dormitoryId: dormitoryRooms.dormitoryId,
      dormitoryName: dormitories.name,
      roomNumber: dormitoryRooms.roomNumber,
      capacity: dormitoryRooms.capacity,
    }).from(dormitoryRooms)
      .innerJoin(dormitories, and(
        eq(dormitories.id, dormitoryRooms.dormitoryId),
        eq(dormitories.schoolId, schoolId),
      ))
      .where(and(
        eq(dormitoryRooms.schoolId, schoolId),
        eq(dormitoryRooms.status, "active"),
        eq(dormitories.status, "active"),
      ))
      .orderBy(asc(dormitories.name), asc(dormitoryRooms.roomNumber)),
    db.select({
      roomId: studentDormitoryAssignments.roomId,
      occupied: count(),
    }).from(studentDormitoryAssignments)
      .where(and(
        eq(studentDormitoryAssignments.schoolId, schoolId),
        eq(studentDormitoryAssignments.status, "active"),
      ))
      .groupBy(studentDormitoryAssignments.roomId),
    db.selectDistinct({ studentId: studentDormitoryAssignments.studentId })
      .from(studentDormitoryAssignments)
      .where(and(
        eq(studentDormitoryAssignments.schoolId, schoolId),
        eq(studentDormitoryAssignments.status, "active"),
      )),
    section === "residents" ? db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      branchId: students.branchId,
    }).from(students).where(and(
      eq(students.schoolId, schoolId),
      inArray(students.status, ["active", "admitted"]),
    )).orderBy(asc(students.lastName), asc(students.firstName)) : Promise.resolve([]),
    db.select({ value: count() }).from(studentDormitoryAssignments).where(and(
      eq(studentDormitoryAssignments.schoolId, schoolId),
      eq(studentDormitoryAssignments.status, "active"),
    )),
    section === "residents" ? db.select({ value: count() }).from(studentDormitoryAssignments)
      .innerJoin(students, eq(students.id, studentDormitoryAssignments.studentId))
      .innerJoin(dormitoryRooms, eq(dormitoryRooms.id, studentDormitoryAssignments.roomId))
      .innerJoin(dormitories, eq(dormitories.id, dormitoryRooms.dormitoryId))
      .where(residentFilter) : Promise.resolve([{ value: 0 }]),
    section === "residents" ? Promise.resolve([]) : db.select({
      id: studentDormitoryAssignments.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      dormitoryName: dormitories.name,
      roomNumber: dormitoryRooms.roomNumber,
      assignedAt: studentDormitoryAssignments.assignedAt,
    }).from(studentDormitoryAssignments)
      .innerJoin(students, eq(students.id, studentDormitoryAssignments.studentId))
      .innerJoin(dormitoryRooms, eq(dormitoryRooms.id, studentDormitoryAssignments.roomId))
      .innerJoin(dormitories, eq(dormitories.id, dormitoryRooms.dormitoryId))
      .where(and(
        eq(studentDormitoryAssignments.schoolId, schoolId),
        eq(studentDormitoryAssignments.status, "active"),
      ))
      .orderBy(desc(studentDormitoryAssignments.assignedAt))
      .limit(6),
  ]);

  const occupancyByRoom = new Map(occupancyRows.map((row) => [row.roomId, Number(row.occupied)]));
  const rooms = roomRows.map((room) => {
    const occupied = occupancyByRoom.get(room.id) ?? 0;
    return { ...room, occupied, available: Math.max(0, room.capacity - occupied) };
  });
  const occupiedBeds = Number(totalAssignments?.value ?? 0);
  const capacity = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const availableBeds = rooms.reduce((sum, room) => sum + room.available, 0);
  const assignedStudentIds = new Set(assignmentIds.map(({ studentId }) => studentId));
  const eligibleStudents = studentRows
    .filter((student) => !assignedStudentIds.has(student.id))
    .map((student) => ({
      id: student.id,
      label: `${student.firstName} ${student.lastName}${student.admissionNumber ? ` · ${student.admissionNumber}` : ""}`,
    }));
  const availableRooms = rooms.filter((room) => room.available > 0)
    .map((room) => ({
      id: room.id,
      label: `${room.dormitoryName} · ${room.roomNumber} (${room.available} bed${room.available === 1 ? "" : "s"} free)`,
    }));
  const totalRows = Number(residentCount?.value ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const residentPageRows = section === "residents" ? await db.select({
    id: studentDormitoryAssignments.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    dormitoryName: dormitories.name,
    roomNumber: dormitoryRooms.roomNumber,
    assignedAt: studentDormitoryAssignments.assignedAt,
  }).from(studentDormitoryAssignments)
    .innerJoin(students, eq(students.id, studentDormitoryAssignments.studentId))
    .innerJoin(dormitoryRooms, eq(dormitoryRooms.id, studentDormitoryAssignments.roomId))
    .innerJoin(dormitories, eq(dormitories.id, dormitoryRooms.dormitoryId))
    .where(residentFilter)
    .orderBy(asc(dormitories.name), asc(dormitoryRooms.roomNumber), asc(students.lastName))
    .limit(pageSize)
    .offset((page - 1) * pageSize) : [];
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams({
      section: "residents",
      page: String(nextPage),
      pageSize: String(pageSize),
    });
    if (search) params.set("search", search);
    return `/portal/dormitories?${params}`;
  };
  const shownResidents = section === "residents" ? residentPageRows : residentRows;

  return (
    <ManagementPortalShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      userName={context.user.name}
      portalType="dormitory"
    >
      <main className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-violet-700">Boarding operations</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              {section === "residents" ? "Room assignments" : "Dormitory overview"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {section === "residents"
                ? "Assign beds, review current residents, and check students out when they leave."
                : "Monitor room capacity and occupancy, and jump into the daily boarding workflows."}
            </p>
          </div>
          <Link href="/admin/dormitories?section=overview"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Open full dormitory workspace
          </Link>
        </header>

        <section aria-label="Dormitory summary" className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard label="Dormitories" value={dormitoryRows.length} icon={<Building2 size={18} />} />
          <SummaryCard label="Rooms" value={rooms.length} icon={<BedDouble size={18} />} />
          <SummaryCard label="Occupied beds" value={occupiedBeds} icon={<UsersRound size={18} />} />
          <SummaryCard label="Available beds" value={availableBeds} icon={<CircleAlert size={18} />} alert={availableBeds === 0 && capacity > 0} />
        </section>

        {section === "residents" && <section className="grid min-w-0 gap-4 xl:grid-cols-2">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
            <h2 className="font-semibold text-slate-950">Assign one student</h2>
            <p className="mb-4 mt-1 text-sm text-slate-600">Choose an unassigned active student and a room with an available bed.</p>
            <StudentRoomAssignmentForm students={eligibleStudents} rooms={availableRooms} today={today} />
            {(eligibleStudents.length === 0 || availableRooms.length === 0) && (
              <p className="mt-3 text-sm text-amber-700">
                {eligibleStudents.length === 0 ? "No unassigned active students are available. " : ""}
                {availableRooms.length === 0 ? "There are no rooms with an available bed." : ""}
              </p>
            )}
          </div>
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
            <h2 className="font-semibold text-slate-950">Bulk assignment</h2>
            <p className="mb-4 mt-1 text-sm text-slate-600">Assign up to 100 students to the same room in one validated batch.</p>
            <BulkStudentRoomAssignmentForm students={eligibleStudents} rooms={availableRooms} today={today} />
          </div>
        </section>}

        {section === "residents" && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <h2 className="font-semibold text-slate-950">Current residents</h2>
            <p className="mt-1 text-sm text-slate-500">{totalRows} active room assignments</p>
            <SmartFilterForm method="get" action="/portal/dormitories" className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
              <input type="hidden" name="section" value="residents" />
              <input type="hidden" name="pageSize" value={pageSize} />
              <input type="search" name="search" defaultValue={search} maxLength={120}
                placeholder="Search student, admission number, dormitory, or room"
                className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
              <button type="submit" className="h-11 shrink-0 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                Search
              </button>
            </SmartFilterForm>
          </div>
          {shownResidents.length > 0 ? <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2">
            {shownResidents.map((resident) => <article key={resident.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold text-slate-900">{resident.firstName} {resident.lastName}</h3>
                  <p className="mt-1 break-words text-sm text-slate-600">{resident.dormitoryName} · Room {resident.roomNumber}</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Assigned</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {resident.admissionNumber ? `${resident.admissionNumber} · ` : ""}Moved in {resident.assignedAt}
              </p>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <EndRoomAssignmentButton assignmentId={resident.id} today={today} />
              </div>
            </article>)}
          </div> : <p className="p-8 text-center text-sm text-slate-500">
            {search ? "No current room assignments match your search." : "No students are currently assigned to a room."}
          </p>}
          <TablePagination
            ariaLabel="Room assignment pagination"
            currentPage={page}
            pageSize={pageSize}
            totalRows={totalRows}
            hrefForPage={pageHref}
          />
        </section>}

        {section === "overview" && <>
          <section aria-label="Dormitory management shortcuts" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { href: "/admin/dormitories?section=dormitories", title: "Dormitories", description: "Manage buildings, branches, and resident policies." },
              { href: "/admin/dormitories?section=rooms", title: "Rooms & beds", description: "Add rooms and track remaining bed capacity." },
              { href: "/portal/dormitories?section=residents", title: "Room assignments", description: "Assign students individually or in validated batches." },
              { href: "/admin/dormitories/reports", title: "Reports", description: "Review and print occupancy and assignment history." },
            ].map((item) => <Link key={item.href} href={item.href}
              className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-300 hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-700">
              <h2 className="break-words font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-1 break-words text-sm text-slate-600">{item.description}</p>
            </Link>)}
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div>
                <h2 className="font-semibold text-slate-950">Recently assigned residents</h2>
                <p className="mt-1 text-sm text-slate-500">Current room assignments across the school.</p>
              </div>
              <Link href="/portal/dormitories?section=residents" className="text-sm font-semibold text-violet-700">View assignments</Link>
            </div>
            {shownResidents.length > 0 ? <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2">
              {shownResidents.map((resident) => <article key={resident.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
                <h3 className="break-words font-semibold text-slate-900">{resident.firstName} {resident.lastName}</h3>
                <p className="mt-1 break-words text-sm text-slate-600">{resident.dormitoryName} · Room {resident.roomNumber}</p>
                <p className="mt-2 text-xs text-slate-500">Moved in {resident.assignedAt}</p>
              </article>)}
            </div> : <p className="p-8 text-center text-sm text-slate-500">No students are currently assigned to a room.</p>}
          </section>
        </>}
      </main>
    </ManagementPortalShell>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  alert = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2 text-sm font-medium text-slate-600">
      <span>{label}</span>
      <span className={alert ? "text-amber-700" : "text-violet-700"}>{icon}</span>
    </div>
    <p className={`mt-3 text-2xl font-bold ${alert ? "text-amber-700" : "text-slate-950"}`}>{value}</p>
  </article>;
}
