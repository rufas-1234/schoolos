"use client";

import { useActionState } from "react";
import { applyForMyLeave } from "@/app/admin/hr/actions";

export function LeaveApplicationForm({
  leaveTypes,
}: {
  leaveTypes: { id: number; name: string; years: number[] }[];
}) {
  const [state, action, pending] = useActionState(applyForMyLeave, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold text-slate-900">Apply for leave</h2>
        <p className="mt-1 text-sm text-slate-500">Your application will be sent to the school leave approver.</p>
      </div>
      {!leaveTypes.length && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">HR has not assigned you a leave entitlement yet.</p>}
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Leave type
        <select name="leaveTypeId" required disabled={!leaveTypes.length} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3">
          <option value="">Select leave type</option>
          {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name} · entitlement for {type.years.join(", ")}</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Start date
          <input name="startDate" type="date" required disabled={!leaveTypes.length} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          End date
          <input name="endDate" type="date" required disabled={!leaveTypes.length} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" />
        </label>
      </div>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Reason
        <textarea name="reason" minLength={3} maxLength={1000} required disabled={!leaveTypes.length} rows={4} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2" placeholder="Explain why you are requesting leave" />
      </label>
      {state.error && <p role="alert" className="text-sm font-medium text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm font-medium text-emerald-700">Leave request submitted. HR will review it.</p>}
      <button disabled={pending || !leaveTypes.length} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "Submitting..." : "Submit leave request"}
      </button>
      <p className="text-xs leading-5 text-slate-500">Leave days are counted as calendar days. Weekends and holidays are included.</p>
    </form>
  );
}
