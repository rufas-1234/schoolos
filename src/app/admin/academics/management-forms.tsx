"use client";

import { useState, type ReactNode } from "react";
import {
  AdminDeleteButton,
  AdminDataTable,
  AdminRecordDialog,
  type AdminTableFilter,
} from "@/components/admin-data-table";
import { RequiredMark } from "@/components/required-mark";
import {
  ActionForm,
  Field,
  SelectField,
  type Option,
} from "./academic-forms";
import {
  createAcademicHoliday,
  createClassRoom,
  createClassRoutine,
  createSchoolBranch,
  createTeacher,
  deleteClassRoom,
  deleteClassRoutine,
  placeStudent,
  recordEnrollmentOperation,
  setSchoolBranchStatus,
  setAcademicYearStatus,
  updateSectionAssignment,
  updateSubjectTeacher,
} from "./management-actions";

export function AcademicYearStatusForm({ years }: { years: Option[] }) {
  return (
    <ActionForm
      title="Activate or archive an academic year"
      action={setAcademicYearStatus}
      submitLabel="Save year status"
    >
      <SelectField label="Academic year" name="academicYearId" options={years} />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Action <RequiredMark />
        <select
          name="status"
          required
          defaultValue="active"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
        >
          <option value="active">Set as active year</option>
          <option value="archived">Archive year</option>
        </select>
      </label>
      <p className="text-xs text-slate-500">
        Only one year can be active. A year with current student enrollments must be completed before it can be changed or archived.
      </p>
    </ActionForm>
  );
}

export function SchoolBranchForm({
  record,
}: {
  record?: {
    id: number;
    name: string;
    code: string;
    contactNumber: string | null;
    email: string | null;
    address: string | null;
  };
} = {}) {
  return (
    <ActionForm
      title={record ? "Edit branch" : "Add branch"}
      action={createSchoolBranch}
      submitLabel={record ? "Save changes" : "Add branch"}
      recordId={record?.id}
    >
      <Field label="Branch name" name="name" placeholder="North campus" defaultValue={record?.name} />
      <Field label="Branch code" name="code" placeholder="NORTH" defaultValue={record?.code} />
      <Field label="Contact number (optional)" name="contactNumber" type="tel" required={false} defaultValue={record?.contactNumber} />
      <Field label="Email (optional)" name="email" type="email" required={false} defaultValue={record?.email} />
      <Field label="Address (optional)" name="address" required={false} defaultValue={record?.address} />
    </ActionForm>
  );
}

export function TeacherForm({
  branches,
  record,
}: {
  branches: Option[];
  record?: {
    id: number;
    branchId: number;
    firstName: string;
    lastName: string;
    employeeCode: string | null;
    email: string | null;
    phone: string | null;
  };
}) {
  return (
    <ActionForm
      title={record ? "Edit teacher" : "Add teacher"}
      action={createTeacher}
      submitLabel={record ? "Save changes" : "Add teacher"}
      recordId={record?.id}
    >
      <SelectField label="Branch" name="branchId" options={branches} defaultValue={record?.branchId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" name="firstName" defaultValue={record?.firstName} />
        <Field label="Last name" name="lastName" defaultValue={record?.lastName} />
      </div>
      <Field label="Employee code (optional)" name="employeeCode" required={false} defaultValue={record?.employeeCode} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email (optional)" name="email" type="email" required={false} defaultValue={record?.email} />
        <Field label="Phone (optional)" name="phone" type="tel" required={false} defaultValue={record?.phone} />
      </div>
    </ActionForm>
  );
}

export function ClassRoomForm({
  branches,
  record,
}: {
  branches: Option[];
  record?: { id: number; branchId: number; roomNumber: string; capacity: number; location: string | null };
}) {
  return (
    <ActionForm
      title={record ? "Edit classroom" : "Add classroom"}
      action={createClassRoom}
      submitLabel={record ? "Save changes" : "Add classroom"}
      recordId={record?.id}
    >
      <SelectField label="Branch" name="branchId" options={branches} defaultValue={record?.branchId} />
      <Field label="Room number / name" name="roomNumber" placeholder="Room 204" defaultValue={record?.roomNumber} />
      <Field label="Student capacity" name="capacity" type="number" defaultValue={record?.capacity} />
      <Field label="Building or location (optional)" name="location" required={false} defaultValue={record?.location} />
    </ActionForm>
  );
}

export function ClassRoutineForm({
  sections,
  assignments,
  rooms,
  record,
}: {
  sections: Option[];
  assignments: Option[];
  rooms: Option[];
  record?: {
    id: number;
    classSectionId: number;
    classSubjectId: number;
    classRoomId: number | null;
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
  };
}) {
  return (
    <ActionForm
      title={record ? "Edit class routine" : "Add class routine"}
      action={createClassRoutine}
      submitLabel={record ? "Save changes" : "Add to routine"}
      recordId={record?.id}
    >
      <SelectField label="Class section" name="sectionId" options={sections} defaultValue={record?.classSectionId} />
      <SelectField label="Class subject" name="classSubjectId" options={assignments} defaultValue={record?.classSubjectId} />
      <SelectField
        label="Classroom (optional)"
        name="classRoomId"
        options={rooms}
        required={false}
        allowEmpty
        emptyLabel="No room assigned"
        defaultValue={record?.classRoomId}
      />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Day <RequiredMark />
        <select
          name="dayOfWeek"
          required
          defaultValue={String(record?.dayOfWeek ?? 1)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
        >
          <option value="1">Monday</option>
          <option value="2">Tuesday</option>
          <option value="3">Wednesday</option>
          <option value="4">Thursday</option>
          <option value="5">Friday</option>
          <option value="6">Saturday</option>
          <option value="7">Sunday</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts at" name="startsAt" type="time" defaultValue={record?.startsAt} />
        <Field label="Ends at" name="endsAt" type="time" defaultValue={record?.endsAt} />
      </div>
      <p className="text-xs text-slate-500">
        A class, assigned teacher, or room cannot be scheduled for overlapping periods.
      </p>
    </ActionForm>
  );
}

export function SchoolBranchList({
  branches,
  filters,
  toolbarActions,
  initialQuery = "",
}: {
  branches: {
    id: number;
    publicId: string;
    name: string;
    code: string;
    status: string;
    contactNumber: string | null;
    email: string | null;
    address: string | null;
  }[];
  filters: AdminTableFilter[];
  toolbarActions?: ReactNode;
  initialQuery?: string;
}) {
  return (
    <AdminDataTable
      title="Branches"
      columns={[
        { key: "name", label: "Branch" },
        { key: "code", label: "Code" },
        { key: "contact", label: "Contact number" },
        { key: "email", label: "Email" },
        { key: "address", label: "Address" },
        { key: "status", label: "Status" },
      ]}
      emptyMessage="No branches have been added."
      filters={filters}
      requireSearchCriteria
      initialQuery={initialQuery}
      toolbarActions={toolbarActions}
      rows={branches.map((branch) => ({
        id: branch.id,
        searchableText: `${branch.name} ${branch.code}`,
        values: {
          name: branch.name,
          code: branch.code,
          contact: branch.contactNumber ?? "",
          email: branch.email ?? "",
          address: branch.address ?? "",
          status: branch.status,
        },
        actions: <div className="flex items-center gap-3">
            <AdminRecordDialog title={`Edit ${branch.name}`}>
              <SchoolBranchForm record={branch} />
            </AdminRecordDialog>
            <form action={setSchoolBranchStatus}>
              <input type="hidden" name="branchId" value={branch.id} />
              <input
                type="hidden"
                name="status"
                value={branch.status === "active" ? "inactive" : "active"}
              />
              <button type="submit" className="text-xs font-semibold text-violet-700 hover:text-violet-900">
                {branch.status === "active" ? "Deactivate" : "Activate"}
              </button>
            </form>
          </div>,
      }))}
    />
  );
}

export function ClassRoomList({
  rooms,
  branches,
  filters,
  toolbarActions,
}: {
  rooms: {
    id: number;
    publicId: string;
    branchId: number;
    branchName: string;
    roomNumber: string;
    capacity: number;
    location: string | null;
  }[];
  branches: Option[];
  filters: AdminTableFilter[];
  toolbarActions?: ReactNode;
}) {
  return (
    <AdminDataTable
      title="Classrooms"
      columns={[
        { key: "branch", label: "Branch" },
        { key: "room", label: "Room" },
        { key: "capacity", label: "Capacity" },
        { key: "location", label: "Location" },
      ]}
      emptyMessage="No classrooms have been added."
      filters={filters}
      requireSearchCriteria
      toolbarActions={toolbarActions}
      rows={rooms.map((room) => ({
        id: room.id,
        values: {
          branch: room.branchName,
          branchId: String(room.branchId),
          room: room.roomNumber,
          capacity: String(room.capacity),
          location: room.location ?? "",
        },
        actions: <div className="flex items-center gap-3">
            <AdminRecordDialog title={`Edit room ${room.roomNumber}`}>
              <ClassRoomForm branches={branches} record={room} />
            </AdminRecordDialog>
            <form action={deleteClassRoom}>
              <input type="hidden" name="publicId" value={room.publicId} />
              <AdminDeleteButton label="Delete classroom" />
            </form>
          </div>,
      }))}
    />
  );
}

export function ClassRoutineList({
  branches,
  classes,
  sections,
  assignments,
  rooms,
  routines,
  toolbarActions,
}: {
  branches: Option[];
  classes: { id: number; branchId: number; label: string }[];
  sections: { id: number; branchId: number; classLevelId: number; label: string }[];
  assignments: Option[];
  rooms: Option[];
  routines: {
    id: number;
    publicId: string;
    branchId: number;
    classLevelId: number;
    classSectionId: number;
    classSubjectId: number;
    classRoomId: number | null;
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
    branchName: string;
    yearName: string;
    sectionName: string;
    className: string;
    subjectName: string;
    teacherName: string;
    roomNumber: string;
  }[];
  toolbarActions?: ReactNode;
}) {
  const [branchId, setBranchId] = useState("");
  const [classLevelId, setClassLevelId] = useState("");
  const [classSectionId, setClassSectionId] = useState("");
  const visibleClasses = classes.filter((classLevel) => !branchId || String(classLevel.branchId) === branchId);
  const visibleSections = sections.filter(
    (section) =>
      (!branchId || String(section.branchId) === branchId) &&
      (!classLevelId || String(section.classLevelId) === classLevelId),
  );
  const filteredRoutines = routines.filter(
    (routine) =>
      (!branchId || String(routine.branchId) === branchId) &&
      (!classLevelId || String(routine.classLevelId) === classLevelId) &&
      (!classSectionId || String(routine.classSectionId) === classSectionId),
  );

  return (
    <div className="space-y-4">
      <div className="print:hidden grid gap-3 sm:grid-cols-3">
        <RoutineFilter
          label="Branch"
          value={branchId}
          options={branches}
          onChange={(value) => {
            setBranchId(value);
            setClassLevelId("");
            setClassSectionId("");
          }}
        />
        <RoutineFilter
          label="Class"
          value={classLevelId}
          options={visibleClasses}
          onChange={(value) => {
            setClassLevelId(value);
            setClassSectionId("");
          }}
        />
        <RoutineFilter
          label="Section"
          value={classSectionId}
          options={visibleSections}
          onChange={setClassSectionId}
        />
      </div>
      <AdminDataTable
          title="Weekly class routine"
          columns={[
            { key: "branch", label: "Branch" },
            { key: "year", label: "Academic year" },
            { key: "class", label: "Class" },
            { key: "section", label: "Section" },
            { key: "subject", label: "Subject" },
            { key: "teacher", label: "Teacher" },
            { key: "day", label: "Day" },
            { key: "time", label: "Time" },
            { key: "room", label: "Room" },
          ]}
          rows={filteredRoutines.map((routine) => ({
            id: routine.id,
            values: {
              branch: routine.branchName,
              year: routine.yearName,
              class: routine.className,
              section: routine.sectionName,
              subject: routine.subjectName,
              teacher: routine.teacherName,
              day: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][routine.dayOfWeek] ?? "",
              time: `${routine.startsAt}–${routine.endsAt}`,
              room: routine.roomNumber,
            },
            actions: <div className="flex items-center gap-3">
                <AdminRecordDialog title="Edit class routine">
                  <ClassRoutineForm
                    sections={sections}
                    assignments={assignments}
                    rooms={rooms}
                    record={routine}
                  />
                </AdminRecordDialog>
                <form action={deleteClassRoutine}>
                  <input type="hidden" name="publicId" value={routine.publicId} />
                  <AdminDeleteButton label="Delete class routine" />
                </form>
              </div>,
          }))}
          emptyMessage={
            routines.length === 0
              ? "No routine periods have been scheduled."
              : "No routines match these filters."
          }
          toolbarActions={toolbarActions}
          requireSearchCriteria
          searchCriteriaSelected={Boolean(branchId || classLevelId || classSectionId)}
      />
    </div>
  );
}

function RoutineFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const allLabel = label === "Branch" ? "branches" : `${label.toLowerCase()}s`;

  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
      >
        <option value="">All {allLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AcademicHolidayForm({
  years,
  terms,
  record,
}: {
  years: Option[];
  terms: Option[];
  record?: {
    id: number;
    academicYearId: number;
    academicTermId: number | null;
    name: string;
    startDate: string;
    endDate: string;
  };
}) {
  return (
    <ActionForm
      title={record ? "Edit school holiday" : "Add school holiday"}
      action={createAcademicHoliday}
      submitLabel={record ? "Save changes" : "Add holiday"}
      recordId={record?.id}
    >
      <SelectField label="Academic year" name="academicYearId" options={years} defaultValue={record?.academicYearId} />
      <SelectField
        label="Term (optional)"
        name="academicTermId"
        options={terms}
        required={false}
        allowEmpty
        emptyLabel="Whole year or not term-specific"
        defaultValue={record?.academicTermId}
      />
      <Field label="Holiday or break name" name="name" placeholder="Winter break" defaultValue={record?.name} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts" name="startDate" type="date" defaultValue={record?.startDate} />
        <Field label="Ends" name="endDate" type="date" defaultValue={record?.endDate} />
      </div>
    </ActionForm>
  );
}

export function SectionAssignmentForm({
  sections,
  teachers,
  record,
}: {
  sections: Option[];
  teachers: Option[];
  record?: { sectionId: number; capacity: number | null; teacherId: number | null };
}) {
  return (
    <ActionForm
      title="Set class capacity and class teacher"
      action={updateSectionAssignment}
      submitLabel="Save class assignment"
    >
      <SelectField label="Class section / stream" name="sectionId" options={sections} defaultValue={record?.sectionId} />
      <Field label="Student capacity (leave blank for unlimited)" name="capacity" type="number" required={false} defaultValue={record?.capacity} />
      <SelectField
        label="Class teacher (optional)"
        name="teacherId"
        options={teachers}
        required={false}
        allowEmpty
        emptyLabel="Unassigned"
        defaultValue={record?.teacherId}
      />
    </ActionForm>
  );
}

export function SubjectTeacherForm({
  assignments,
  teachers,
  record,
}: {
  assignments: Option[];
  teachers: Option[];
  record?: { assignmentId: number; teacherId: number | null };
}) {
  return (
    <ActionForm
      title="Assign a subject teacher"
      action={updateSubjectTeacher}
      submitLabel="Save subject teacher"
    >
      <SelectField label="Class subject" name="assignmentId" options={assignments} defaultValue={record?.assignmentId} />
      <SelectField
        label="Teacher"
        name="teacherId"
        options={teachers}
        required={false}
        allowEmpty
        emptyLabel="Unassigned"
        defaultValue={record?.teacherId}
      />
    </ActionForm>
  );
}

export function StudentPlacementForm({
  students,
  sections,
}: {
  students: Option[];
  sections: Option[];
}) {
  const [eventType, setEventType] = useState("initial_placement");

  return (
    <ActionForm title="Place a student in a class" action={placeStudent} submitLabel="Place student">
      <SelectField label="Admitted / active student" name="studentId" options={students} />
      <SelectField label="Active-year class section" name="sectionId" options={sections} />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Placement type <RequiredMark />
        <select
          name="eventType"
          required
          defaultValue="initial_placement"
          onChange={(event) => setEventType(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
        >
          <option value="initial_placement">Initial placement</option>
          <option value="transfer_in">Transfer in from another school</option>
        </select>
      </label>
      <Field
        label="Previous school"
        name="externalInstitution"
        required={eventType === "transfer_in"}
      />
      <Field label="Placement date" name="eventDate" type="date" />
      <Field label="Reason / notes" name="reason" placeholder="Admission placement" />
    </ActionForm>
  );
}

export function EnrollmentOperationForm({
  enrollments,
  years,
  sections,
}: {
  enrollments: Option[];
  years: Option[];
  sections: Option[];
}) {
  const [operation, setOperation] = useState("promote");
  const needsDestination = operation !== "transfer_out" && operation !== "graduate";

  return (
    <ActionForm
      title="Record promotion, repetition, transfer, or graduation"
      action={recordEnrollmentOperation}
      submitLabel="Record academic operation"
    >
      <SelectField label="Current enrollment" name="enrollmentId" options={enrollments} />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Operation <RequiredMark />
        <select
          name="operation"
          required
          defaultValue="promote"
          onChange={(event) => setOperation(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
        >
          <option value="promote">Promote to a different class in a later year</option>
          <option value="repeat">Repeat the same class in a later year</option>
          <option value="transfer_in_school">Transfer to another section this year</option>
          <option value="transfer_out">Transfer out to another school</option>
          <option value="graduate">Graduate</option>
        </select>
      </label>
      <SelectField
        label="Destination academic year (not needed for transfer-out / graduation)"
        name="targetYearId"
        options={years}
        required={needsDestination}
        allowEmpty
        emptyLabel="No destination year"
      />
      <SelectField
        label="Destination class section (not needed for transfer-out / graduation)"
        name="targetSectionId"
        options={sections}
        required={needsDestination}
        allowEmpty
        emptyLabel="No destination section"
      />
      <Field
        label="Destination school"
        name="externalInstitution"
        required={operation === "transfer_out"}
      />
      <Field label="Operation date" name="eventDate" type="date" />
      <Field label="Reason / notes" name="reason" placeholder="End-of-year result" />
      <p className="text-xs text-slate-500">
        Promotion and repetition retain the completed enrollment and create a new year record. The destination section must belong to the destination year.
      </p>
    </ActionForm>
  );
}

export function AcademicEventList({
  events,
}: {
  events: {
    id: number;
    student: string;
    type: string;
    date: string;
    fromSection: string;
    toSection: string;
    externalInstitution: string;
    reason: string;
  }[];
}) {
  return (
    <AdminDataTable
      title="Recent student academic history"
      columns={[
        { key: "student", label: "Student" },
        { key: "type", label: "Event" },
        { key: "date", label: "Date" },
        { key: "fromSection", label: "From section" },
        { key: "toSection", label: "To section" },
        { key: "externalInstitution", label: "Other school" },
        { key: "reason", label: "Reason" },
      ]}
      rows={events.map((event) => ({
        id: event.id,
        values: {
          student: event.student,
          type: event.type,
          date: event.date,
          fromSection: event.fromSection,
          toSection: event.toSection,
          externalInstitution: event.externalInstitution,
          reason: event.reason,
        },
      }))}
      filters={[{
        key: "type",
        label: "event type",
        options: uniqueValues(events.map((event) => event.type)),
      }]}
      requireSearchCriteria
      emptyMessage="No placement or progression events yet."
    />
  );
}

export function EnrollmentRecordList({
  enrollments,
  toolbarActions,
}: {
  enrollments: {
    id: number;
    student: string;
    className: string;
    section: string;
    academicYear: string;
    status: string;
    enrolledAt: string;
  }[];
  toolbarActions?: ReactNode;
}) {
  return (
    <AdminDataTable
      title="Enrollment register"
      columns={[
        { key: "student", label: "Student" },
        { key: "className", label: "Class" },
        { key: "section", label: "Section" },
        { key: "academicYear", label: "Academic year" },
        { key: "status", label: "Status" },
        { key: "enrolledAt", label: "Enrolled on" },
      ]}
      rows={enrollments.map((enrollment) => ({
        id: enrollment.id,
        values: {
          student: enrollment.student,
          className: enrollment.className,
          section: enrollment.section,
          academicYear: enrollment.academicYear,
          status: enrollment.status,
          enrolledAt: enrollment.enrolledAt,
          classFilter: enrollment.className,
          yearFilter: enrollment.academicYear,
          statusFilter: enrollment.status,
        },
      }))}
      filters={[
        {
          key: "classFilter",
          label: "class",
          options: uniqueValues(enrollments.map((enrollment) => enrollment.className)),
        },
        {
          key: "yearFilter",
          label: "academic year",
          options: uniqueValues(enrollments.map((enrollment) => enrollment.academicYear)),
        },
        {
          key: "statusFilter",
          label: "status",
          options: uniqueValues(enrollments.map((enrollment) => enrollment.status)),
        },
      ]}
      requireSearchCriteria
      emptyMessage="No student enrollments yet."
      toolbarActions={toolbarActions}
    />
  );
}

function uniqueValues(values: string[]) {
  return [...new Set(values)]
    .sort((first, second) => first.localeCompare(second))
    .map((value) => ({ value, label: value }));
}
