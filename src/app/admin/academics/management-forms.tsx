"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AdminActionDialog,
  AdminDeleteButton,
  AdminDataTable,
  AdminRecordDialog,
  type AdminTableFilter,
} from "@/components/admin-data-table";
import { RequiredMark } from "@/components/required-mark";
import { SearchableSelect } from "@/components/searchable-select";
import { deleteClassLevel, type AcademicActionState } from "./actions";
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
  deleteClassRoom,
  deleteClassRoutine,
  placeStudent,
  recordEnrollmentOperation,
  setSchoolBranchStatus,
  setAcademicYearStatus,
  setClassLevelStatus,
  updateSectionAssignment,
  updateSubjectTeacher,
} from "./management-actions";

export function ClassLevelDeleteForm({ classLevelId }: { classLevelId: number }) {
  const [state, formAction, pending] = useActionState<AcademicActionState, FormData>(deleteClassLevel, {});

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="recordId" value={classLevelId} />
      <AdminDeleteButton label="Delete class" disabled={pending} />
      {state.error && <p role="alert" className="max-w-64 text-xs text-rose-700">{state.error}</p>}
      {pending && <span role="status" className="text-xs text-slate-500">Deleting class...</span>}
    </form>
  );
}

export function ClassLevelStatusForm({
  classLevelId,
  status,
}: {
  classLevelId: number;
  status: string;
}) {
  return (
    <ActionForm
      title={status === "active" ? "Archive class" : "Restore class"}
      action={setClassLevelStatus}
      submitLabel={status === "active" ? "Archive class" : "Restore class"}
    >
      <input type="hidden" name="classLevelId" value={classLevelId} />
      <input type="hidden" name="status" value={status === "active" ? "archived" : "active"} />
      <p className="text-sm text-slate-600">
        {status === "active"
          ? "Archiving hides this class from new placements and fee setup, while keeping its sections, student history, and invoices."
          : "Restoring makes this class available for new placements and fee setup again."}
      </p>
    </ActionForm>
  );
}

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
  branches,
  sections,
  assignments,
  rooms,
  record,
  defaultSectionId,
  defaultDayOfWeek = 1,
}: {
  branches: Option[];
  sections: (Option & { branchId: number; classLevelId: number })[];
  assignments: (Option & { classLevelId: number })[];
  rooms: (Option & { branchId: number })[];
  defaultSectionId?: number;
  defaultDayOfWeek?: number;
  record?: {
    id: number;
    branchId: number;
    classSectionId: number;
    classSubjectId: number;
    classRoomId: number | null;
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
  };
}) {
  const [branchId, setBranchId] = useState(String(
    record?.branchId ??
      sections.find((section) => section.id === defaultSectionId)?.branchId ??
      "",
  ));
  const [sectionId, setSectionId] = useState(String(record?.classSectionId ?? defaultSectionId ?? ""));
  const [assignmentId, setAssignmentId] = useState(String(record?.classSubjectId ?? ""));
  const [roomId, setRoomId] = useState(String(record?.classRoomId ?? ""));
  const availableSections = sections.filter((section) => String(section.branchId) === branchId);
  const selectedSection = availableSections.find((section) => String(section.id) === sectionId);
  const availableAssignments = selectedSection
    ? assignments.filter((assignment) => assignment.classLevelId === selectedSection.classLevelId)
    : [];
  const availableRooms = selectedSection
    ? rooms.filter((room) => room.branchId === selectedSection.branchId)
    : [];

  return (
    <ActionForm
      title={record ? "Edit class routine" : "Add class routine"}
      action={createClassRoutine}
      submitLabel={record ? "Save changes" : "Add to routine"}
      recordId={record?.id}
    >
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches.map((branch) => ({ value: String(branch.id), label: branch.label }))}
        defaultValue={branchId}
        required
        disabled={branches.length === 0}
        placeholder={branches.length === 0 ? "Create a branch first" : "Search branches..."}
        onValueChange={(value) => {
          setBranchId(value);
          setSectionId("");
          setAssignmentId("");
          setRoomId("");
        }}
      />
      <SearchableSelect
        key={branchId}
        label="Class section"
        name="sectionId"
        options={availableSections.map((section) => ({ value: String(section.id), label: section.label }))}
        defaultValue={sectionId}
        required
        disabled={!branchId || availableSections.length === 0}
        placeholder={!branchId ? "Choose a branch first" : "Search sections..."}
        onValueChange={(value) => {
          setSectionId(value);
          setAssignmentId("");
          setRoomId("");
        }}
      />
      <SearchableSelect
        key={`subject-${sectionId}`}
        label="Subject for this class"
        name="classSubjectId"
        options={availableAssignments.map((assignment) => ({ value: String(assignment.id), label: assignment.label }))}
        defaultValue={availableAssignments.some((assignment) => String(assignment.id) === assignmentId) ? assignmentId : ""}
        required
        disabled={availableAssignments.length === 0}
        placeholder={!selectedSection ? "Choose a class section first" : "Search subjects..."}
        onValueChange={setAssignmentId}
      />
      <SearchableSelect
        key={`room-${sectionId}`}
        label="Classroom (optional)"
        name="classRoomId"
        options={[
          { value: "", label: "No room assigned" },
          ...availableRooms.map((room) => ({ value: String(room.id), label: room.label })),
        ]}
        defaultValue={availableRooms.some((room) => String(room.id) === roomId) ? roomId : ""}
        disabled={!selectedSection || availableRooms.length === 0}
        placeholder="Search classrooms..."
        onValueChange={setRoomId}
      />
      <p className="text-xs text-slate-500">
        Choose a branch and section first; only subjects assigned to that class and classrooms at that branch are available.
      </p>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Day <RequiredMark />
        <select
          name="dayOfWeek"
          required
          defaultValue={String(record?.dayOfWeek ?? defaultDayOfWeek)}
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
  canDelete,
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
  canDelete: boolean;
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
            {canDelete && (
              <form action={deleteClassRoom}>
                <input type="hidden" name="publicId" value={room.publicId} />
                <AdminDeleteButton label="Delete classroom" />
              </form>
            )}
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
  canDelete,
}: {
  branches: Option[];
  classes: { id: number; branchId: number; label: string }[];
  sections: { id: number; branchId: number; classLevelId: number; label: string }[];
  assignments: (Option & { classLevelId: number })[];
  rooms: (Option & { branchId: number })[];
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
  canDelete: boolean;
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
  const selectedSection = visibleSections.find((section) => String(section.id) === classSectionId);
  const selectedRoutines = filteredRoutines
    .filter((routine) => String(routine.classSectionId) === classSectionId)
    .sort((first, second) =>
      first.startsAt.localeCompare(second.startsAt) ||
      first.endsAt.localeCompare(second.endsAt),
    );
  const timeSlots = Array.from(
    new Map(
      selectedRoutines.map((routine) => [
        `${routine.startsAt}-${routine.endsAt}`,
        { startsAt: routine.startsAt, endsAt: routine.endsAt },
      ]),
    ).values(),
  );
  const weekdays = [
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
    { value: 7, label: "Sunday" },
  ];
  const criteriaSelected = Boolean(branchId && classLevelId && classSectionId);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">Build the weekly timetable</p>
        <p className="mt-1 text-sm text-slate-600">
          Select a branch, class, and section to view its routine. The list updates as you choose each filter.
        </p>
      </div>
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
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Weekly class routine</h2>
            <p className="mt-1 text-sm text-slate-500">
              {criteriaSelected && selectedSection
                ? `${selectedSection.label} · ${selectedRoutines.length} scheduled ${selectedRoutines.length === 1 ? "period" : "periods"}`
                : "Select a branch, class, and section to open its weekly timetable."}
            </p>
          </div>
          {criteriaSelected && selectedSection && (
            <Link
              href={`/admin/academics/routines/print?sectionId=${selectedSection.id}`}
              className="print:hidden inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Print class routine
            </Link>
          )}
        </div>
        {!criteriaSelected ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Select a branch, class, and section above to view or create the class routine.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-36 border-b border-r border-slate-200 px-4 py-3 font-semibold">
                    Period
                  </th>
                  {weekdays.map((day) => (
                    <th key={day.value} scope="col" className="min-w-40 border-b border-slate-200 px-3 py-2 text-center font-semibold">
                      <span className="block">{day.label}</span>
                      {selectedSection && (
                        <span className="mt-2 inline-flex">
                          <AdminActionDialog label="Add period" title={`Add ${day.label} period`}>
                            <ClassRoutineForm
                              branches={branches}
                              sections={sections}
                              assignments={assignments}
                              rooms={rooms}
                              defaultSectionId={selectedSection.id}
                              defaultDayOfWeek={day.value}
                            />
                          </AdminActionDialog>
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {timeSlots.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <p className="font-medium text-slate-800">No periods scheduled for this section yet.</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Use “Add routine” to add the first subject, day, and time.
                      </p>
                    </td>
                  </tr>
                ) : (
                  timeSlots.map((slot) => (
                    <tr key={`${slot.startsAt}-${slot.endsAt}`} className="align-top">
                      <th scope="row" className="whitespace-nowrap border-r border-slate-200 bg-slate-50/70 px-4 py-4 font-semibold text-slate-700">
                        <span className="block text-xs font-medium uppercase tracking-wide text-slate-400">Time</span>
                        <span className="mt-1 block">{slot.startsAt}–{slot.endsAt}</span>
                      </th>
                      {weekdays.map((day) => {
                        const routine = selectedRoutines.find(
                          (entry) =>
                            entry.dayOfWeek === day.value &&
                            entry.startsAt === slot.startsAt &&
                            entry.endsAt === slot.endsAt,
                        );

                        return (
                          <td key={day.value} className="border-l border-slate-100 p-2">
                            {routine ? (
                              <div className="min-h-28 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                                <p className="font-semibold text-violet-950">{routine.subjectName}</p>
                                <p className="mt-1 text-xs text-slate-600">{routine.teacherName}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {routine.roomNumber ? `Room ${routine.roomNumber}` : "No room assigned"}
                                </p>
                                <div className="mt-3 flex items-center gap-2">
                                  <AdminRecordDialog title={`Edit ${routine.subjectName} routine`}>
                                    <ClassRoutineForm
                                      branches={branches}
                                      sections={sections}
                                      assignments={assignments}
                                      rooms={rooms}
                                      record={routine}
                                    />
                                  </AdminRecordDialog>
                                  {canDelete && (
                                    <form action={deleteClassRoutine}>
                                      <input type="hidden" name="publicId" value={routine.publicId} />
                                      <AdminDeleteButton label={`Delete ${routine.subjectName} routine`} />
                                    </form>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-slate-200 text-slate-300">
                                —
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
    <SearchableSelect
      label={label}
      name={`${label.toLocaleLowerCase()}Filter`}
      options={[
        { value: "", label: `All ${allLabel}` },
        ...options.map((option) => ({ value: String(option.id), label: option.label })),
      ]}
      defaultValue={value}
      placeholder={`Search ${allLabel}...`}
      onValueChange={onChange}
    />
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
  branches,
  sections,
  teachers,
  record,
}: {
  branches: Option[];
  sections: (Option & { branchId: number })[];
  teachers: (Option & { branchId: number })[];
  record?: { sectionId: number; capacity: number | null; teacherId: number | null };
}) {
  const [branchId, setBranchId] = useState(
    String(sections.find((section) => section.id === record?.sectionId)?.branchId ?? ""),
  );
  const [sectionId, setSectionId] = useState(String(record?.sectionId ?? ""));
  const [teacherId, setTeacherId] = useState(String(record?.teacherId ?? ""));
  const availableSections = sections.filter((section) => String(section.branchId) === branchId);
  const availableTeachers = teachers.filter((teacher) => String(teacher.branchId) === branchId);

  return (
    <ActionForm
      title="Set class capacity and class teacher"
      action={updateSectionAssignment}
      submitLabel="Save class assignment"
    >
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches.map((branch) => ({ value: String(branch.id), label: branch.label }))}
        defaultValue={branchId}
        required
        disabled={branches.length === 0}
        placeholder={branches.length === 0 ? "Create a branch first" : "Search branches..."}
        onValueChange={(value) => {
          setBranchId(value);
          setSectionId("");
          setTeacherId("");
        }}
      />
      <SearchableSelect
        key={branchId}
        label="Class section / stream"
        name="sectionId"
        options={availableSections.map((section) => ({ value: String(section.id), label: section.label }))}
        defaultValue={sectionId}
        required
        disabled={!branchId || availableSections.length === 0}
        placeholder={!branchId ? "Choose a branch first" : "Search class sections..."}
        onValueChange={(value) => {
          setSectionId(value);
          setTeacherId("");
        }}
      />
      <Field label="Student capacity (leave blank for unlimited)" name="capacity" type="number" required={false} defaultValue={record?.capacity} />
      <SearchableSelect
        key={`teacher-${branchId}`}
        label="Class teacher (optional)"
        name="teacherId"
        options={[
          { value: "", label: "Unassigned" },
          ...availableTeachers.map((teacher) => ({ value: String(teacher.id), label: teacher.label })),
        ]}
        defaultValue={availableTeachers.some((teacher) => String(teacher.id) === teacherId) ? teacherId : ""}
        disabled={!sectionId || availableTeachers.length === 0}
        placeholder="Search teachers..."
        onValueChange={setTeacherId}
      />
    </ActionForm>
  );
}

export function SubjectTeacherForm({
  branches,
  assignments,
  teachers,
  record,
}: {
  branches: Option[];
  assignments: (Option & { branchId: number })[];
  teachers: (Option & { branchId: number })[];
  record?: { assignmentId: number; teacherId: number | null };
}) {
  const [branchId, setBranchId] = useState(
    String(assignments.find((assignment) => assignment.id === record?.assignmentId)?.branchId ?? ""),
  );
  const [assignmentId, setAssignmentId] = useState(String(record?.assignmentId ?? ""));
  const [teacherId, setTeacherId] = useState(String(record?.teacherId ?? ""));
  const availableAssignments = assignments.filter((assignment) => String(assignment.branchId) === branchId);
  const availableTeachers = teachers.filter((teacher) => String(teacher.branchId) === branchId);

  return (
    <ActionForm
      title="Assign a subject teacher"
      action={updateSubjectTeacher}
      submitLabel="Save subject teacher"
    >
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches.map((branch) => ({ value: String(branch.id), label: branch.label }))}
        defaultValue={branchId}
        required
        disabled={branches.length === 0}
        placeholder={branches.length === 0 ? "Create a branch first" : "Search branches..."}
        onValueChange={(value) => {
          setBranchId(value);
          setAssignmentId("");
          setTeacherId("");
        }}
      />
      <SearchableSelect
        key={branchId}
        label="Class subject"
        name="assignmentId"
        options={availableAssignments.map((assignment) => ({ value: String(assignment.id), label: assignment.label }))}
        defaultValue={assignmentId}
        required
        disabled={!branchId || availableAssignments.length === 0}
        placeholder={!branchId ? "Choose a branch first" : "Search class subjects..."}
        onValueChange={(value) => {
          setAssignmentId(value);
          setTeacherId("");
        }}
      />
      <SearchableSelect
        key={`teacher-${branchId}-${assignmentId}`}
        label="Teacher"
        name="teacherId"
        options={[
          { value: "", label: "Unassigned" },
          ...availableTeachers.map((teacher) => ({ value: String(teacher.id), label: teacher.label })),
        ]}
        defaultValue={availableTeachers.some((teacher) => String(teacher.id) === teacherId) ? teacherId : ""}
        disabled={!assignmentId || availableTeachers.length === 0}
        placeholder="Search teachers..."
        onValueChange={setTeacherId}
      />
    </ActionForm>
  );
}

export function StudentPlacementForm({
  branches,
  students,
  sections,
}: {
  branches: Option[];
  students: Option[];
  sections: (Option & { branchId: number })[];
}) {
  const [eventType, setEventType] = useState("initial_placement");
  const [branchId, setBranchId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const availableSections = sections.filter((section) => String(section.branchId) === branchId);

  return (
    <ActionForm title="Place a student in a class" action={placeStudent} submitLabel="Place student">
      <SelectField label="Admitted / active student" name="studentId" options={students} />
      <SearchableSelect
        label="Branch"
        name="branchId"
        options={branches.map((branch) => ({ value: String(branch.id), label: branch.label }))}
        defaultValue={branchId}
        required
        disabled={branches.length === 0}
        placeholder={branches.length === 0 ? "Create a branch first" : "Search branches..."}
        onValueChange={(value) => {
          setBranchId(value);
          setSectionId("");
        }}
      />
      <SearchableSelect
        key={branchId}
        label="Active-year class section"
        name="sectionId"
        options={availableSections.map((section) => ({ value: String(section.id), label: section.label }))}
        defaultValue={sectionId}
        required
        disabled={!branchId || availableSections.length === 0}
        placeholder={!branchId ? "Choose a branch first" : "Search class sections..."}
        onValueChange={setSectionId}
      />
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
  branches,
  enrollments,
  years,
  sections,
}: {
  branches: Option[];
  enrollments: Option[];
  years: Option[];
  sections: (Option & { branchId: number; academicYearId: number })[];
}) {
  const [operation, setOperation] = useState("promote");
  const needsDestination = operation !== "transfer_out" && operation !== "graduate";
  const [yearId, setYearId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const availableSections = sections.filter(
    (section) =>
      String(section.academicYearId) === yearId &&
      String(section.branchId) === branchId,
  );

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
          <option value="promote">Promote or place in a different class in a later year</option>
          <option value="repeat">Repeat the same class in a later year</option>
          <option value="transfer_in_school">Transfer to another class or section this year</option>
          <option value="transfer_out">Transfer out to another school</option>
          <option value="graduate">Graduate</option>
        </select>
      </label>
      <SearchableSelect
        label="Destination academic year (not needed for transfer-out / graduation)"
        name="targetYearId"
        options={[
          { value: "", label: needsDestination ? "Choose a destination year" : "No destination year" },
          ...years.map((year) => ({ value: String(year.id), label: year.label })),
        ]}
        required={needsDestination}
        defaultValue={yearId}
        disabled={!needsDestination || !years.length}
        placeholder="Search academic years..."
        onValueChange={(value) => {
          setYearId(value);
          setSectionId("");
        }}
      />
      <SearchableSelect
        key={`destination-branch-${needsDestination}`}
        label="Destination branch"
        name="branchId"
        options={[
          { value: "", label: needsDestination ? "Choose a branch" : "No destination branch" },
          ...branches.map((branch) => ({ value: String(branch.id), label: branch.label })),
        ]}
        required={needsDestination}
        defaultValue={branchId}
        disabled={!needsDestination || !branches.length}
        placeholder="Search branches..."
        onValueChange={(value) => {
          setBranchId(value);
          setSectionId("");
        }}
      />
      <SearchableSelect
        key={`destination-section-${yearId}-${branchId}-${needsDestination}`}
        label="Destination class section (not needed for transfer-out / graduation)"
        name="targetSectionId"
        options={[
          {
            value: "",
            label: !needsDestination
              ? "No destination section"
              : !yearId || !branchId
                ? "Choose a year and branch first"
                : "No class sections for this year and branch",
          },
          ...availableSections.map((section) => ({ value: String(section.id), label: section.label })),
        ]}
        required={needsDestination}
        defaultValue={sectionId}
        disabled={!needsDestination || !yearId || !branchId || !availableSections.length}
        placeholder="Search class sections..."
        onValueChange={setSectionId}
      />
      <Field
        label="Destination school"
        name="externalInstitution"
        required={operation === "transfer_out"}
      />
      <Field label="Operation date" name="eventDate" type="date" />
      <Field label="Reason / notes" name="reason" placeholder="End-of-year result" />
      <p className="text-xs text-slate-500">
        In-school transfers can move a student to any class or section in the same year, including a lower class. Promotion or placement and repetition create a new enrollment for a later year, and can also target a different class. The destination section must belong to the selected year.
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
