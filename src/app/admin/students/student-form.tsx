"use client";

import { useActionState } from "react";
import { createStudent } from "./actions";

const initialState = { success: false, error: undefined };

export function StudentForm() {
  const [state, formAction, pending] = useActionState(createStudent, initialState);

  return (
    <form action={formAction} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Add student</h2>
        <p className="mt-1 text-sm text-slate-500">Capture the basic enrollment information for a new student.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          First name
          <input
            name="firstName"
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
            placeholder="Amina"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          Last name
          <input
            name="lastName"
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
            placeholder="Patel"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700 md:col-span-2">
          Email address
          <input
            name="email"
            type="email"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
            placeholder="student@example.com"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700 md:col-span-2">
          Phone number
          <input
            name="phone"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
            placeholder="+1 555 123 4567"
          />
        </label>

        <label className="space-y-1.5 text-sm font-medium text-slate-700 md:col-span-2">
          Status
          <select
            name="status"
            defaultValue="active"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white"
          >
            <option value="active">Active</option>
            <option value="admitted">Admitted</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600">Student added successfully.</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-violet-400"
        >
          {pending ? "Adding..." : "Add student"}
        </button>
      </div>
    </form>
  );
}
