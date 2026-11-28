"use client";

import { useActionState } from "react";
import { AdminActionDialog } from "@/components/admin-data-table";
import { createSchool, type CreateSchoolState } from "./actions";

const fieldClass = "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

export function CreateSchoolForm() {
  const [state, action, pending] = useActionState<CreateSchoolState, FormData>(createSchool, {});
  return <AdminActionDialog label="Create workspace" title="Create a school workspace" className="w-[min(96vw,64rem)]">
    <form action={action} className="space-y-7">
      <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
        <h2 className="text-xl font-bold text-slate-900">Set up a school workspace</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">A workspace created here activates immediately and starts the school trial. Public applications are reviewed separately.</p>
      </div>
      <section className="space-y-4">
        <div><h3 className="font-semibold text-slate-900">School details</h3><p className="text-sm text-slate-500">Contact information used for this school workspace.</p></div>
        <label className="block space-y-1.5 text-sm font-semibold text-slate-700">School name<input name="schoolName" required minLength={2} maxLength={255} className={fieldClass}/></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-semibold text-slate-700">School email <span className="font-normal text-slate-500">(optional)</span><input name="schoolEmail" type="email" maxLength={320} className={fieldClass}/></label>
          <label className="block space-y-1.5 text-sm font-semibold text-slate-700">School phone <span className="font-normal text-slate-500">(optional)</span><input name="schoolPhone" maxLength={40} className={fieldClass}/></label>
        </div>
        <label className="block space-y-1.5 text-sm font-semibold text-slate-700">School address <span className="font-normal text-slate-500">(optional)</span><textarea name="schoolAddress" rows={3} maxLength={1000} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"/></label>
      </section>
      <section className="space-y-4 border-t border-slate-200 pt-6">
        <div><h3 className="font-semibold text-slate-900">Workspace administrator</h3><p className="text-sm text-slate-500">Enter an existing account email, or complete all new-account fields to create an administrator.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-semibold text-slate-700">Administrator name <span className="font-normal text-slate-500">(new account)</span><input name="adminName" minLength={2} maxLength={255} className={fieldClass}/></label>
          <label className="block space-y-1.5 text-sm font-semibold text-slate-700">Administrator email<input name="adminEmail" type="email" required maxLength={320} className={fieldClass}/></label>
        </div>
        <label className="block space-y-1.5 text-sm font-semibold text-slate-700">Initial password <span className="font-normal text-slate-500">(new account, at least 12 characters)</span><input name="adminPassword" type="password" maxLength={128} autoComplete="new-password" className={fieldClass}/></label>
      </section>
      {state.error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{state.success}</p>}
      <div className="flex justify-end border-t border-slate-200 pt-5"><button type="submit" disabled={pending} className="rounded-xl bg-violet-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Creating workspace…" : "Create workspace"}</button></div>
    </form>
  </AdminActionDialog>;
}
