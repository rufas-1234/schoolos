import { and, asc, count, eq, inArray, like, or } from "drizzle-orm";
import { TablePagination } from "@/components/table-pagination";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { parsePageSize } from "@/components/pagination-utils";
import type { AdminTableColumn, AdminTableRow } from "@/components/admin-data-table";
import { db } from "@/db";
import {
  dormitories,
  dormitoryRooms,
  schoolBranches,
  studentDormitoryAssignments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  DormitoryForm,
  DormitoryRoomForm,
  EndRoomAssignmentButton,
  StudentRoomAssignmentForm,
} from "./dormitory-forms";

export const dynamic = "force-dynamic";

type SearchParams = {
  section?: string | string[];
  search?: string | string[];
  branchId?: string | string[];
  dormitoryId?: string | string[];
  genderPolicy?: string | string[];
  occupancy?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validPage(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? Math.max(1, page) : 1;
}

function parseIdFilter(value: string): number | undefined {
  if (!value) return undefined;
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) && id > 0 ? id : -1;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function DormitoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await requireSchoolPermission("dormitories.manage");
  const query = await searchParams;
  const sections = ["overview", "dormitories", "rooms", "residents"] as const;
  const requestedSection = first(query.section);
  const section = sections.includes(requestedSection as (typeof sections)[number])
    ? requestedSection as (typeof sections)[number]
    : "overview";
  const search = (first(query.search) ?? "").trim().slice(0, 120);
  const branchId = first(query.branchId) ?? "";
  const dormitoryId = first(query.dormitoryId) ?? "";
  const genderPolicy = first(query.genderPolicy) ?? "";
  const requestedOccupancy = first(query.occupancy);
  const occupancy = requestedOccupancy === "available" || requestedOccupancy === "full"
    ? requestedOccupancy
    : "";
  const pageSize = parsePageSize(first(query.pageSize));
  const requestedPage = validPage(first(query.page));
  const schoolId = context.schoolId;

  const [dormitoryRows, branchRows, roomRows, studentRows, assignmentRows, occupancyRows] = await Promise.all([
    db.select().from(dormitories).where(and(
      eq(dormitories.schoolId, schoolId),
      eq(dormitories.status, "active"),
    )).orderBy(asc(dormitories.name)),
    db.select({ id: schoolBranches.id, name: schoolBranches.name }).from(schoolBranches).where(and(
      eq(schoolBranches.schoolId, schoolId),
      eq(schoolBranches.status, "active"),
    )).orderBy(asc(schoolBranches.name)),
    db.select({
      id: dormitoryRooms.id,
      dormitoryId: dormitoryRooms.dormitoryId,
      dormitoryName: dormitories.name,
      roomNumber: dormitoryRooms.roomNumber,
      capacity: dormitoryRooms.capacity,
      status: dormitoryRooms.status,
    }).from(dormitoryRooms).innerJoin(dormitories, and(
      eq(dormitories.id, dormitoryRooms.dormitoryId),
      eq(dormitories.schoolId, schoolId),
    )).where(and(
      eq(dormitoryRooms.schoolId, schoolId),
      eq(dormitoryRooms.status, "active"),
      eq(dormitories.status, "active"),
    )).orderBy(asc(dormitories.name), asc(dormitoryRooms.roomNumber)),
    section === "residents" ? db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      branchId: students.branchId,
      status: students.status,
    }).from(students).where(and(
      eq(students.schoolId, schoolId),
      inArray(students.status, ["active", "admitted"]),
    )).orderBy(asc(students.lastName), asc(students.firstName)) : Promise.resolve([]),
    db.selectDistinct({ studentId: studentDormitoryAssignments.studentId })
      .from(studentDormitoryAssignments)
      .where(and(
        eq(studentDormitoryAssignments.schoolId, schoolId),
        eq(studentDormitoryAssignments.status, "active"),
      )),
    db.select({
      roomId: studentDormitoryAssignments.roomId,
      occupied: count(),
    }).from(studentDormitoryAssignments).where(and(
      eq(studentDormitoryAssignments.schoolId, schoolId),
      eq(studentDormitoryAssignments.status, "active"),
    )).groupBy(studentDormitoryAssignments.roomId),
  ]);
  const today = todayDate();
  const branchNames = new Map(branchRows.map((branch) => [branch.id, branch.name]));
  const occupancyByRoom = new Map(occupancyRows.map((row) => [row.roomId, Number(row.occupied)]));
  const rooms = roomRows.map((room) => ({
    ...room,
    occupied: occupancyByRoom.get(room.id) ?? 0,
    available: room.capacity - (occupancyByRoom.get(room.id) ?? 0),
  }));
  const dormitoryOptions = dormitoryRows.map((item) => ({ id: item.id, label: item.name }));
  const roomOptions = rooms.filter((room) => room.available > 0)
    .map((room) => ({
      id: room.id,
      label: `${room.dormitoryName} · ${room.roomNumber} (${room.available} bed${room.available === 1 ? "" : "s"} free)`,
    }));
  const studentOptions = studentRows.map((student) => ({
    id: student.id,
    label: `${student.firstName} ${student.lastName}${student.admissionNumber ? ` · ${student.admissionNumber}` : ""}`,
  }));
  const assignedStudents = new Set(assignmentRows.map((assignment) => assignment.studentId));
  const eligibleStudents = studentOptions.filter((student) => !assignedStudents.has(student.id));
  const occupiedBedCount = occupancyRows.reduce((total, row) => total + Number(row.occupied), 0);

  const searchPattern = `%${search}%`;
  const validBranchId = parseIdFilter(branchId);
  const validDormitoryId = parseIdFilter(dormitoryId);
  let visibleRows: AdminTableRow[] = [];
  let totalRows = 0;
  if (section === "dormitories") {
    const where = and(
      eq(dormitories.schoolId, schoolId),
      eq(dormitories.status, "active"),
      validBranchId ? eq(dormitories.branchId, validBranchId) : undefined,
      genderPolicy ? eq(dormitories.genderPolicy, genderPolicy) : undefined,
      search ? or(
        like(dormitories.name, searchPattern),
        like(dormitories.description, searchPattern),
        like(schoolBranches.name, searchPattern),
      ) : undefined,
    );
    const countResult = await db.select({ total: count() }).from(dormitories)
      .leftJoin(schoolBranches, and(
        eq(schoolBranches.id, dormitories.branchId),
        eq(schoolBranches.schoolId, schoolId),
      )).where(where);
    totalRows = Number(countResult[0]?.total ?? 0);
    const offset = (Math.min(requestedPage, Math.max(1, Math.ceil(totalRows / pageSize))) - 1) * pageSize;
    const pageRows = await db.select({
        id: dormitories.id,
        name: dormitories.name,
        description: dormitories.description,
        branchId: dormitories.branchId,
        genderPolicy: dormitories.genderPolicy,
      }).from(dormitories)
        .leftJoin(schoolBranches, and(
          eq(schoolBranches.id, dormitories.branchId),
          eq(schoolBranches.schoolId, schoolId),
        ))
        .where(where).orderBy(asc(dormitories.name))
        .limit(pageSize).offset(offset);
    visibleRows = pageRows.map((dormitory) => {
      const roomsForDormitory = rooms.filter((room) => room.dormitoryId === dormitory.id);
      const capacity = roomsForDormitory.reduce((total, room) => total + room.capacity, 0);
      const occupied = roomsForDormitory.reduce((total, room) => total + room.occupied, 0);
      return {
        id: dormitory.id,
        values: {
          name: dormitory.name,
          branch: dormitory.branchId ? branchNames.get(dormitory.branchId) ?? "Branch" : "All branches",
          policy: dormitory.genderPolicy,
          rooms: String(roomsForDormitory.length),
          beds: `${occupied} / ${capacity}`,
          description: dormitory.description ?? "",
        },
      };
    });
  } else if (section === "rooms") {
    const occupancyRoomIds = occupancy
      ? rooms.filter((room) => occupancy === "available" ? room.available > 0 : room.available === 0).map((room) => room.id)
      : undefined;
    const where = and(
      eq(dormitoryRooms.schoolId, schoolId),
      eq(dormitoryRooms.status, "active"),
      eq(dormitories.status, "active"),
      validDormitoryId ? eq(dormitoryRooms.dormitoryId, validDormitoryId) : undefined,
      occupancyRoomIds ? inArray(dormitoryRooms.id, occupancyRoomIds) : undefined,
      search ? or(
        like(dormitories.name, searchPattern),
        like(dormitoryRooms.roomNumber, searchPattern),
      ) : undefined,
    );
    const countResult = await db.select({ total: count() }).from(dormitoryRooms)
      .innerJoin(dormitories, and(
        eq(dormitories.id, dormitoryRooms.dormitoryId),
        eq(dormitories.schoolId, schoolId),
      )).where(where);
    totalRows = Number(countResult[0]?.total ?? 0);
    const offset = (Math.min(requestedPage, Math.max(1, Math.ceil(totalRows / pageSize))) - 1) * pageSize;
    const pageRows = await db.select({
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
        .where(where).orderBy(asc(dormitories.name), asc(dormitoryRooms.roomNumber))
        .limit(pageSize).offset(offset);
    visibleRows = pageRows.map((room) => {
      const occupied = occupancyByRoom.get(room.id) ?? 0;
      return {
        id: room.id,
        values: {
          dormitory: room.dormitoryName,
          dormitoryId: String(room.dormitoryId),
          room: room.roomNumber,
          capacity: String(room.capacity),
          occupied: String(occupied),
          available: String(room.capacity - occupied),
        },
      };
    });
  } else if (section === "residents") {
    const where = and(
      eq(studentDormitoryAssignments.schoolId, schoolId),
      eq(studentDormitoryAssignments.status, "active"),
      validDormitoryId ? eq(dormitoryRooms.dormitoryId, validDormitoryId) : undefined,
      search ? or(
        like(students.firstName, searchPattern),
        like(students.lastName, searchPattern),
        like(students.admissionNumber, searchPattern),
        like(dormitories.name, searchPattern),
        like(dormitoryRooms.roomNumber, searchPattern),
      ) : undefined,
    );
    const countResult = await db.select({ total: count() }).from(studentDormitoryAssignments)
        .innerJoin(students, and(
          eq(students.id, studentDormitoryAssignments.studentId),
          eq(students.schoolId, schoolId),
        ))
        .innerJoin(dormitoryRooms, and(
          eq(dormitoryRooms.id, studentDormitoryAssignments.roomId),
          eq(dormitoryRooms.schoolId, schoolId),
        ))
        .innerJoin(dormitories, and(
          eq(dormitories.id, dormitoryRooms.dormitoryId),
          eq(dormitories.schoolId, schoolId),
        )).where(where);
    totalRows = Number(countResult[0]?.total ?? 0);
    const offset = (Math.min(requestedPage, Math.max(1, Math.ceil(totalRows / pageSize))) - 1) * pageSize;
    const pageRows = await db.select({
        id: studentDormitoryAssignments.id,
        studentName: students.firstName,
        studentLastName: students.lastName,
        admissionNumber: students.admissionNumber,
        dormitoryName: dormitories.name,
        dormitoryId: dormitories.id,
        roomNumber: dormitoryRooms.roomNumber,
        assignedAt: studentDormitoryAssignments.assignedAt,
      }).from(studentDormitoryAssignments)
        .innerJoin(students, and(
          eq(students.id, studentDormitoryAssignments.studentId),
          eq(students.schoolId, schoolId),
        ))
        .innerJoin(dormitoryRooms, and(
          eq(dormitoryRooms.id, studentDormitoryAssignments.roomId),
          eq(dormitoryRooms.schoolId, schoolId),
        ))
        .innerJoin(dormitories, and(
          eq(dormitories.id, dormitoryRooms.dormitoryId),
          eq(dormitories.schoolId, schoolId),
        ))
        .where(where)
        .orderBy(asc(dormitories.name), asc(dormitoryRooms.roomNumber), asc(students.lastName))
        .limit(pageSize).offset(offset);
    visibleRows = pageRows.map((assignment) => ({
      id: assignment.id,
      values: {
        student: `${assignment.studentName} ${assignment.studentLastName}`,
        admissionNumber: assignment.admissionNumber ?? "",
        dormitory: assignment.dormitoryName,
        dormitoryId: String(assignment.dormitoryId),
        room: assignment.roomNumber,
        assignedAt: assignment.assignedAt,
      },
      actions: <EndRoomAssignmentButton assignmentId={assignment.id} today={today} />,
    }));
  }
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const hrefForPage = (nextPage: number) => {
    const params = new URLSearchParams({ section, page: String(nextPage), pageSize: String(pageSize) });
    if (search) params.set("search", search);
    if (branchId) params.set("branchId", branchId);
    if (dormitoryId) params.set("dormitoryId", dormitoryId);
    if (genderPolicy) params.set("genderPolicy", genderPolicy);
    if (occupancy) params.set("occupancy", occupancy);
    return `/admin/dormitories?${params}`;
  };
  const columns: Record<typeof section, AdminTableColumn[]> = {
    overview: [],
    dormitories: [
      { key: "name", label: "Dormitory" },
      { key: "branch", label: "Branch" },
      { key: "policy", label: "Resident policy" },
      { key: "rooms", label: "Rooms" },
      { key: "beds", label: "Occupied / beds" },
      { key: "description", label: "Description" },
    ],
    rooms: [
      { key: "dormitory", label: "Dormitory" },
      { key: "room", label: "Room" },
      { key: "capacity", label: "Bed capacity" },
      { key: "occupied", label: "Occupied" },
      { key: "available", label: "Available" },
    ],
    residents: [
      { key: "student", label: "Student" },
      { key: "admissionNumber", label: "Admission number" },
      { key: "dormitory", label: "Dormitory" },
      { key: "room", label: "Room" },
      { key: "assignedAt", label: "Move-in date" },
    ],
  };
  const sectionTitle = {
    overview: "Dormitory overview",
    dormitories: "Dormitories",
    rooms: "Rooms & beds",
    residents: "Room assignments",
  }[section];

  return <main className="min-w-0 space-y-5 p-3 sm:space-y-6 sm:p-6">
    <header>
      <p className="text-sm font-semibold text-violet-700">School operations</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{sectionTitle}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">Manage dormitories, rooms, bed capacity, student assignments, and checkouts.</p>
    </header>

    {section === "overview" && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Dormitories" value={dormitoryRows.length} />
      <SummaryCard label="Rooms" value={rooms.length} />
      <SummaryCard label="Occupied beds" value={occupiedBedCount} />
      <SummaryCard label="Available beds" value={rooms.reduce((total, room) => total + room.available, 0)} />
    </section>}

    {section === "dormitories" && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold text-slate-950">Add a dormitory</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Choose its school branch and the residents it accepts.</p>
        <DormitoryForm branches={branchRows.map((branch) => ({ id: branch.id, label: branch.name }))} />
      </section>
      <FilterForm section={section} search={search} branchId={branchId} dormitoryId={dormitoryId}
        genderPolicy={genderPolicy} occupancy={occupancy} pageSize={pageSize}
        branchRows={branchRows} dormitoryOptions={dormitoryOptions} />
      <RecordsTable title="Dormitories" columns={columns.dormitories} rows={visibleRows}
        emptyMessage={search || branchId || genderPolicy ? "No dormitories match these filters." : "No dormitories have been created."} />
    </>}

    {section === "rooms" && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold text-slate-950">Add a room</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Each room tracks its bed capacity separately.</p>
        <DormitoryRoomForm dormitories={dormitoryOptions} />
      </section>
      <FilterForm section={section} search={search} branchId={branchId} dormitoryId={dormitoryId}
        genderPolicy={genderPolicy} occupancy={occupancy} pageSize={pageSize}
        branchRows={branchRows} dormitoryOptions={dormitoryOptions} />
      <RecordsTable title="Rooms & bed capacity" columns={columns.rooms} rows={visibleRows}
        emptyMessage={search || dormitoryId || occupancy ? "No rooms match these filters." : "Add a room to start tracking occupancy."} />
    </>}

    {section === "residents" && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold text-slate-950">Assign a student to a room</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Only active or admitted students without a current room assignment can be assigned.</p>
        <StudentRoomAssignmentForm students={eligibleStudents} rooms={roomOptions} today={today} />
        {(eligibleStudents.length === 0 || roomOptions.length === 0) && (
          <p className="mt-3 text-sm text-amber-700">
            {eligibleStudents.length === 0 ? "No unassigned active students are available. " : ""}
            {roomOptions.length === 0 ? "Add a room with an available bed before making assignments." : ""}
          </p>
        )}
      </section>
      <FilterForm section={section} search={search} branchId={branchId} dormitoryId={dormitoryId}
        genderPolicy={genderPolicy} occupancy={occupancy} pageSize={pageSize}
        branchRows={branchRows} dormitoryOptions={dormitoryOptions} />
      <RecordsTable title="Current residents" columns={columns.residents} rows={visibleRows}
        emptyMessage={search || dormitoryId ? "No residents match these filters." : "No students are currently assigned to a room."} />
    </>}

    {section !== "overview" && <TablePagination
      ariaLabel={`${sectionTitle} pagination`}
      currentPage={page}
      pageSize={pageSize}
      totalRows={totalRows}
      hrefForPage={hrefForPage}
    />}
    <p className="text-xs text-slate-500">Older dormitory and room text on student profiles remains available there; structured assignments are managed here.</p>
  </main>;
}

function FilterForm({
  section,
  search,
  branchId,
  dormitoryId,
  genderPolicy,
  occupancy,
  pageSize,
  branchRows,
  dormitoryOptions,
}: {
  section: "dormitories" | "rooms" | "residents";
  search: string;
  branchId: string;
  dormitoryId: string;
  genderPolicy: string;
  occupancy: string;
  pageSize: number;
  branchRows: Array<{ id: number; name: string }>;
  dormitoryOptions: Array<{ id: number; label: string }>;
}) {
  return <SmartFilterForm method="get" className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
    <input type="hidden" name="section" value={section} />
    <input type="hidden" name="pageSize" value={pageSize} />
    <label className="block min-w-0 text-sm font-medium text-slate-700">Search
      <input type="search" name="search" defaultValue={search}
        placeholder={section === "residents" ? "Student, admission no., room..." : "Dormitory or room..."}
        className="mt-1 h-11 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm" />
    </label>
    {section === "dormitories" && <>
      <label className="block min-w-0 text-sm font-medium text-slate-700">Branch
        <select name="branchId" defaultValue={branchId} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <option value="">All branches</option>{branchRows.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
      <label className="block min-w-0 text-sm font-medium text-slate-700">Resident policy
        <select name="genderPolicy" defaultValue={genderPolicy} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <option value="">All policies</option><option value="male">Male</option><option value="female">Female</option><option value="mixed">Mixed</option>
        </select>
      </label>
    </>}
    {(section === "rooms" || section === "residents") && <label className="block min-w-0 text-sm font-medium text-slate-700">Dormitory
      <select name="dormitoryId" defaultValue={dormitoryId} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
        <option value="">All dormitories</option>{dormitoryOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>}
    {section === "rooms" && <label className="block min-w-0 text-sm font-medium text-slate-700">Bed availability
      <select name="occupancy" defaultValue={occupancy} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
        <option value="">All rooms</option><option value="available">Available beds</option><option value="full">Full rooms</option>
      </select>
    </label>}
    <div className="flex items-end gap-3">
      <button type="submit" className="h-11 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white">Apply filters</button>
      <a href={`/admin/dormitories?section=${section}`} className="text-sm font-medium text-violet-700">Clear</a>
    </div>
  </SmartFilterForm>;
}

function RecordsTable({
  title,
  columns,
  rows,
  emptyMessage,
}: {
  title: string;
  columns: AdminTableColumn[];
  rows: AdminTableRow[];
  emptyMessage: string;
}) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{rows.length} records on this page</p>
    </div>
    {rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{emptyMessage}</p> : <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{columns.map((column) => <th key={column.key} className="px-4 py-3">{column.label}</th>)}
              {rows.some((row) => row.actions) && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => <tr key={row.id} className="align-top">
              {columns.map((column) => <td key={column.key} className="px-4 py-3 text-slate-700">{row.values[column.key] || "—"}</td>)}
              {rows.some((item) => item.actions) && <td className="px-4 py-3">{row.actions}</td>}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-3 sm:hidden">
        {rows.map((row) => <article key={row.id} className="rounded-xl border border-slate-200 p-3">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            {columns.map((column, index) => <div key={column.key} className={index === 0 ? "col-span-2" : "min-w-0"}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{column.label}</dt>
              <dd className="mt-0.5 break-words text-sm text-slate-900">{row.values[column.key] || "—"}</dd>
            </div>)}
          </dl>
          {row.actions && <div className="mt-3 border-t border-slate-100 pt-3">{row.actions}</div>}
        </article>)}
      </div>
    </>}
  </section>;
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
    <p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
  </div>;
}
