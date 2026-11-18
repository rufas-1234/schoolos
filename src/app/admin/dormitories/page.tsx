import { and, asc, count, eq, inArray } from "drizzle-orm";
import { AdminDataTable, type AdminTableRow } from "@/components/admin-data-table";
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

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function DormitoriesPage() {
  const context = await requireSchoolPermission("dormitories.manage");
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
    db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      branchId: students.branchId,
      status: students.status,
    }).from(students).where(and(
      eq(students.schoolId, schoolId),
      inArray(students.status, ["active", "admitted"]),
    )).orderBy(asc(students.lastName), asc(students.firstName)),
    db.select({
      id: studentDormitoryAssignments.id,
      studentId: students.id,
      studentName: students.firstName,
      studentLastName: students.lastName,
      admissionNumber: students.admissionNumber,
      dormitoryName: dormitories.name,
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
      .where(and(
        eq(studentDormitoryAssignments.schoolId, schoolId),
        eq(studentDormitoryAssignments.status, "active"),
      )).orderBy(asc(dormitories.name), asc(dormitoryRooms.roomNumber), asc(students.lastName)),
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
  const occupancy = new Map(occupancyRows.map((row) => [row.roomId, Number(row.occupied)]));
  const rooms = roomRows.map((room) => ({
    ...room,
    occupied: occupancy.get(room.id) ?? 0,
    available: room.capacity - (occupancy.get(room.id) ?? 0),
  }));
  const dormitoryOptions = dormitoryRows.map((dormitory) => ({ id: dormitory.id, label: dormitory.name }));
  const roomOptions = rooms.filter((room) => room.available > 0)
    .map((room) => ({ id: room.id, label: `${room.dormitoryName} · ${room.roomNumber} (${room.available} bed${room.available === 1 ? "" : "s"} free)` }));
  const studentOptions = studentRows.map((student) => ({
    id: student.id,
    label: `${student.firstName} ${student.lastName}${student.admissionNumber ? ` · ${student.admissionNumber}` : ""}`,
  }));
  const assignedStudents = new Set(assignmentRows.map((assignment) => assignment.studentId));
  const eligibleStudents = studentOptions.filter((student) => !assignedStudents.has(student.id));
  const dormitoryTableRows: AdminTableRow[] = dormitoryRows.map((dormitory) => {
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
      searchableText: `${dormitory.name} ${dormitory.description ?? ""}`,
    };
  });
  const roomTableRows: AdminTableRow[] = rooms.map((room) => ({
    id: room.id,
    values: {
      dormitory: room.dormitoryName,
      room: room.roomNumber,
      capacity: String(room.capacity),
      occupied: String(room.occupied),
      available: String(room.available),
    },
    searchableText: `${room.dormitoryName} ${room.roomNumber}`,
  }));
  const residentTableRows: AdminTableRow[] = assignmentRows.map((assignment) => ({
    id: assignment.id,
    values: {
      student: `${assignment.studentName} ${assignment.studentLastName}`,
      admissionNumber: assignment.admissionNumber ?? "",
      dormitory: assignment.dormitoryName,
      room: assignment.roomNumber,
      assignedAt: assignment.assignedAt,
    },
    searchableText: `${assignment.studentName} ${assignment.studentLastName} ${assignment.admissionNumber ?? ""} ${assignment.dormitoryName} ${assignment.roomNumber}`,
    actions: <EndRoomAssignmentButton assignmentId={assignment.id} today={today} />,
  }));

  return <main className="min-w-0 space-y-6 p-4 sm:p-6">
    <header>
      <p className="text-sm font-semibold text-violet-700">School operations</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Dormitory management</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">Set up dormitories and rooms, manage bed capacity, assign students, and record checkouts.</p>
    </header>

    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold text-slate-950">Add a dormitory</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Choose its school branch and the residents it accepts.</p>
        <DormitoryForm branches={branchRows.map((branch) => ({ id: branch.id, label: branch.name }))} />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold text-slate-950">Add a room</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Each room tracks its bed capacity separately.</p>
        <DormitoryRoomForm dormitories={dormitoryOptions} />
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="font-semibold text-slate-950">Assign a student</h2>
      <p className="mb-4 mt-1 text-sm text-slate-500">Only active or admitted students without a current room assignment can be assigned.</p>
      <StudentRoomAssignmentForm students={eligibleStudents} rooms={roomOptions} today={today} />
      {(eligibleStudents.length === 0 || roomOptions.length === 0) && (
        <p className="mt-3 text-sm text-amber-700">
          {eligibleStudents.length === 0 ? "No unassigned active students are available. " : ""}
          {roomOptions.length === 0 ? "Add a room with an available bed before making assignments." : ""}
        </p>
      )}
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Dormitories" value={dormitoryRows.length} />
      <SummaryCard label="Rooms" value={rooms.length} />
      <SummaryCard label="Occupied beds" value={assignmentRows.length} />
      <SummaryCard label="Available beds" value={rooms.reduce((total, room) => total + room.available, 0)} />
    </section>

    <section className="grid gap-5">
      <AdminDataTable
        title="Dormitories"
        columns={[
          { key: "name", label: "Dormitory" },
          { key: "branch", label: "Branch" },
          { key: "policy", label: "Resident policy" },
          { key: "rooms", label: "Rooms" },
          { key: "beds", label: "Occupied / beds" },
          { key: "description", label: "Description" },
        ]}
        rows={dormitoryTableRows}
        emptyMessage="No dormitories have been created."
        mobileCardView
      />
      <AdminDataTable
        title="Room capacity"
        columns={[
          { key: "dormitory", label: "Dormitory" },
          { key: "room", label: "Room" },
          { key: "capacity", label: "Bed capacity" },
          { key: "occupied", label: "Occupied" },
          { key: "available", label: "Available" },
        ]}
        rows={roomTableRows}
        emptyMessage="Add a room to start tracking occupancy."
        mobileCardView
      />
      <AdminDataTable
        title="Current residents"
        columns={[
          { key: "student", label: "Student" },
          { key: "admissionNumber", label: "Admission number" },
          { key: "dormitory", label: "Dormitory" },
          { key: "room", label: "Room" },
          { key: "assignedAt", label: "Move-in date" },
        ]}
        rows={residentTableRows}
        emptyMessage="No students are currently assigned to a room."
        mobileCardView
      />
    </section>
    <p className="text-xs text-slate-500">Older dormitory and room text on student profiles remains available there; structured assignments are managed here.</p>
  </main>;
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4">
    <p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
  </div>;
}
