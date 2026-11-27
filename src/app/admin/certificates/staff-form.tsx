"use client";

import Link from "next/link";
import { useActionState } from "react";
import { issueStaffCertificate, type StaffCertificateState } from "./staff-actions";

export function StaffCertificateForm({ staff }: { staff: { id: number; label: string }[] }) {
  const [state, action, pending] = useActionState<StaffCertificateState, FormData>(issueStaffCertificate, {});
  return <form action={action} className="space-y-4">
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">Staff member
      <select name="staffId" required defaultValue="" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="">Select staff</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
    </label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium text-slate-700">Certificate category<input name="category" required minLength={2} maxLength={120} placeholder="Service, training, employment..." className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" /></label>
      <label className="space-y-1.5 text-sm font-medium text-slate-700">Certificate title<input name="title" required minLength={2} maxLength={160} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" /></label>
      <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">Achievement or details<textarea name="achievement" required minLength={2} maxLength={2000} rows={3} className="w-full rounded-xl border border-slate-200 bg-white p-3" /></label>
      <label className="space-y-1.5 text-sm font-medium text-slate-700">Issue date<input name="issuedAt" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" /></label>
    </div>
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {state.success && state.publicId && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Certificate issued. <Link className="font-semibold underline" href={`/admin/certificates/staff/${state.publicId}/print`}>View and print</Link></div>}
    <button disabled={pending || !staff.length} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Issuing..." : "Issue staff certificate"}</button>
    {!staff.length && <p className="text-sm text-amber-700">Add an active staff record before issuing a staff certificate.</p>}
  </form>;
}
