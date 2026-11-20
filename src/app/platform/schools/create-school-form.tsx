"use client";

import { useActionState } from "react";
import { createSchool, type CreateSchoolState } from "./actions";

const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

export function CreateSchoolForm() {
  const [state, action, pending] = useActionState<CreateSchoolState, FormData>(createSchool, {});

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Provision a school</h2>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        School name
        <input name="schoolName" required minLength={2} maxLength={255} className={fieldClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          School email (optional)
          <input name="schoolEmail" type="email" maxLength={320} className={fieldClass} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          School phone (optional)
          <input name="schoolPhone" maxLength={40} className={fieldClass} />
        </label>
      </div>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        School address (optional)
        <textarea name="schoolAddress" rows={2} maxLength={1000} className={fieldClass} />
      </label>
      <h3 className="border-t border-slate-100 pt-4 font-semibold text-slate-900">School administrator</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Administrator name (new account)
          <input name="adminName" minLength={2} maxLength={255} className={fieldClass} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Administrator email
          <input name="adminEmail" type="email" required maxLength={320} className={fieldClass} />
        </label>
      </div>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Initial password (new account)
        <input name="adminPassword" type="password" maxLength={128} autoComplete="new-password" className={fieldClass} />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating school…" : "Create school"}
      </button>
    </form>
  );
}
