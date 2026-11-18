"use client";

import { useActionState, useState } from "react";
import {
  assignStudentToRoom,
  bulkAssignStudentsToRoom,
  createDormitory,
  createDormitoryRoom,
  endStudentRoomAssignment,
  type DormitoryActionState,
} from "./actions";
import { SearchableSelect } from "@/components/searchable-select";

type Option = { id: number; label: string };

function Feedback({ state }: { state: DormitoryActionState }) {
  return <>
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
  </>;
}

function SubmitButton({ pending, label, disabled = false }: { pending: boolean; label: string; disabled?: boolean }) {
  return <button type="submit" disabled={pending || disabled}
    className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
    {pending ? "Saving..." : label}
  </button>;
}

export function DormitoryForm({ branches }: { branches: Option[] }) {
  const [state, action, pending] = useActionState<DormitoryActionState, FormData>(createDormitory, {});
  return <form action={action} className="space-y-3">
    <label className="block text-sm font-medium">Dormitory name
      <input name="name" required maxLength={120} className="mt-1 h-10 w-full max-w-md rounded-lg border px-3" />
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="max-w-md"><SearchableSelect label="Branch" name="branchId"
        options={[{ value: "", label: "All branches" }, ...branches.map((branch) => ({ value: String(branch.id), label: branch.label }))]}
        placeholder="Search branches..." /></div>
      <label className="block text-sm font-medium">Residents
        <select name="genderPolicy" defaultValue="mixed" className="mt-1 h-10 w-full max-w-md rounded-lg border bg-white px-3">
          <option value="mixed">Mixed</option><option value="male">Male</option><option value="female">Female</option>
        </select>
      </label>
    </div>
    <label className="block text-sm font-medium">Description
      <textarea name="description" rows={2} maxLength={1000} className="mt-1 w-full max-w-xl rounded-lg border px-3 py-2" />
    </label>
    <Feedback state={state} /><SubmitButton pending={pending} label="Add dormitory" />
  </form>;
}

export function DormitoryRoomForm({ dormitories }: { dormitories: Option[] }) {
  const [state, action, pending] = useActionState<DormitoryActionState, FormData>(createDormitoryRoom, {});
  return <form action={action} className="space-y-3">
    <div className="max-w-md"><SearchableSelect label="Dormitory" name="dormitoryId" required
      options={dormitories.map((item) => ({ value: String(item.id), label: item.label }))}
      placeholder="Search dormitories..." /></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium">Room number
        <input name="roomNumber" required maxLength={40} className="mt-1 h-10 w-full max-w-md rounded-lg border px-3" />
      </label>
      <label className="block text-sm font-medium">Bed capacity
        <input name="capacity" type="number" min={1} max={1000} required defaultValue={1} className="mt-1 h-10 w-full max-w-md rounded-lg border px-3" />
      </label>
    </div>
    <Feedback state={state} /><SubmitButton pending={pending} label="Add room" />
  </form>;
}

export function StudentRoomAssignmentForm({
  students,
  rooms,
  today,
}: {
  students: Option[];
  rooms: Option[];
  today: string;
}) {
  const [state, action, pending] = useActionState<DormitoryActionState, FormData>(assignStudentToRoom, {});
  return <form action={action} className="grid gap-3 sm:grid-cols-2">
    <div className="max-w-md"><SearchableSelect label="Student" name="studentId" required
      options={students.map((student) => ({ value: String(student.id), label: student.label }))}
      placeholder="Search students..." /></div>
    <div className="max-w-md"><SearchableSelect label="Available room" name="roomId" required
      options={rooms.map((room) => ({ value: String(room.id), label: room.label }))}
      placeholder="Search available rooms..." /></div>
    <label className="block text-sm font-medium">Move-in date
      <input type="date" name="assignedAt" required defaultValue={today} max={today} className="mt-1 h-11 w-full max-w-xs rounded-lg border px-3" />
    </label>
    <div className="flex items-end"><SubmitButton pending={pending} label="Assign room" /></div>
    <div className="sm:col-span-2"><Feedback state={state} /></div>
  </form>;
}

export function BulkStudentRoomAssignmentForm({
  students,
  rooms,
  today,
}: {
  students: Option[];
  rooms: Option[];
  today: string;
}) {
  const [state, action, pending] = useActionState<DormitoryActionState, FormData>(bulkAssignStudentsToRoom, {});
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const matches = students.filter((student) =>
    student.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const visibleStudents = matches.slice(0, 60);
  const visibleStudentIds = new Set(visibleStudents.map((student) => student.id));
  const allVisibleSelected = visibleStudents.length > 0 &&
    visibleStudents.every((student) => selectedIds.includes(student.id));

  function toggleVisibleStudents() {
    const visibleIds = new Set(visibleStudents.map((student) => student.id));
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.has(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  return <form action={action} className="space-y-4">
    {selectedIds.filter((id) => !visibleStudentIds.has(id)).map((id) => (
      <input key={id} type="hidden" name="studentIds" value={id} />
    ))}
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="max-w-md"><SearchableSelect label="Available room" name="roomId" required
        options={rooms.map((room) => ({ value: String(room.id), label: room.label }))}
        placeholder="Search available rooms..." /></div>
      <label className="block max-w-xs text-sm font-medium">Move-in date
        <input type="date" name="assignedAt" required defaultValue={today} max={today}
          className="mt-1 h-11 w-full rounded-lg border px-3" />
      </label>
    </div>
    <label className="block max-w-md text-sm font-medium">Find students
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Name or admission number" className="mt-1 h-11 w-full rounded-lg border px-3" />
    </label>
    <div className="max-w-3xl rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <p className="text-sm font-medium text-slate-700">{selectedIds.length} selected · {matches.length} matching students</p>
        <button type="button" onClick={toggleVisibleStudents} className="text-sm font-semibold text-violet-700">
          {allVisibleSelected ? "Clear visible" : `Select visible${matches.length > 60 ? " (first 60)" : ""}`}
        </button>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto p-2">
        {visibleStudents.map((student) => (
          <label key={student.id} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <input type="checkbox" name="studentIds" value={student.id} checked={selectedIds.includes(student.id)}
              onChange={(event) => setSelectedIds((current) => event.target.checked
                ? [...current, student.id]
                : current.filter((id) => id !== student.id))}
              className="accent-violet-700" />
            <span className="truncate">{student.label}</span>
          </label>
        ))}
        {visibleStudents.length === 0 && <p className="p-3 text-sm text-slate-500">No unassigned students match this search.</p>}
      </div>
    </div>
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
    {selectedIds.length > 100 && <p role="alert" className="text-sm text-rose-700">Select no more than 100 students per batch.</p>}
    <SubmitButton pending={pending} disabled={selectedIds.length === 0 || selectedIds.length > 100 || rooms.length === 0}
      label="Assign selected students" />
  </form>;
}

export function EndRoomAssignmentButton({ assignmentId, today }: { assignmentId: number; today: string }) {
  const [state, action, pending] = useActionState<DormitoryActionState, FormData>(endStudentRoomAssignment, {});
  return <form action={action} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="assignmentId" value={assignmentId} />
    <input type="hidden" name="leftAt" value={today} />
    <button type="submit" disabled={pending}
      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
      {pending ? "Checking out..." : "Check out"}
    </button>
    <Feedback state={state} />
  </form>;
}
