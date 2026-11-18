"use client";

import { useActionState } from "react";
import {
  assignStudentToRoom,
  createDormitory,
  createDormitoryRoom,
  endStudentRoomAssignment,
  type DormitoryActionState,
} from "./actions";

type Option = { id: number; label: string };

function Feedback({ state }: { state: DormitoryActionState }) {
  return <>
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
  </>;
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return <button type="submit" disabled={pending}
    className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
    {pending ? "Saving..." : label}
  </button>;
}

export function DormitoryForm({ branches }: { branches: Option[] }) {
  const [state, action, pending] = useActionState<DormitoryActionState, FormData>(createDormitory, {});
  return <form action={action} className="space-y-3">
    <label className="block text-sm font-medium">Dormitory name
      <input name="name" required maxLength={120} className="mt-1 h-10 w-full rounded-lg border px-3" />
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium">Branch
        <select name="branchId" defaultValue="" className="mt-1 h-10 w-full rounded-lg border bg-white px-3">
          <option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Residents
        <select name="genderPolicy" defaultValue="mixed" className="mt-1 h-10 w-full rounded-lg border bg-white px-3">
          <option value="mixed">Mixed</option><option value="male">Male</option><option value="female">Female</option>
        </select>
      </label>
    </div>
    <label className="block text-sm font-medium">Description
      <textarea name="description" rows={2} maxLength={1000} className="mt-1 w-full rounded-lg border px-3 py-2" />
    </label>
    <Feedback state={state} /><SubmitButton pending={pending} label="Add dormitory" />
  </form>;
}

export function DormitoryRoomForm({ dormitories }: { dormitories: Option[] }) {
  const [state, action, pending] = useActionState<DormitoryActionState, FormData>(createDormitoryRoom, {});
  return <form action={action} className="space-y-3">
    <label className="block text-sm font-medium">Dormitory
      <select name="dormitoryId" required defaultValue="" className="mt-1 h-10 w-full rounded-lg border bg-white px-3">
        <option value="" disabled>Select dormitory</option>{dormitories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium">Room number
        <input name="roomNumber" required maxLength={40} className="mt-1 h-10 w-full rounded-lg border px-3" />
      </label>
      <label className="block text-sm font-medium">Bed capacity
        <input name="capacity" type="number" min={1} max={1000} required defaultValue={1} className="mt-1 h-10 w-full rounded-lg border px-3" />
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
    <label className="block text-sm font-medium">Student
      <select name="studentId" required defaultValue="" className="mt-1 h-11 w-full rounded-lg border bg-white px-3">
        <option value="" disabled>Select student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}
      </select>
    </label>
    <label className="block text-sm font-medium">Available room
      <select name="roomId" required defaultValue="" className="mt-1 h-11 w-full rounded-lg border bg-white px-3">
        <option value="" disabled>Select room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.label}</option>)}
      </select>
    </label>
    <label className="block text-sm font-medium">Move-in date
      <input type="date" name="assignedAt" required defaultValue={today} max={today} className="mt-1 h-11 w-full rounded-lg border px-3" />
    </label>
    <div className="flex items-end"><SubmitButton pending={pending} label="Assign room" /></div>
    <div className="sm:col-span-2"><Feedback state={state} /></div>
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
