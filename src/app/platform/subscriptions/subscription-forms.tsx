"use client";

import { useActionState } from "react";
import { AdminActionDialog } from "@/components/admin-data-table";
import { assignSchoolPlan, confirmSubscriptionInvoice, createSubscriptionInvoice, type SubscriptionActionState } from "./actions";

type Choice = { id: number; label: string };

export function AssignPlanForm({ schools, plans }: { schools: Choice[]; plans: Choice[] }) {
  const [state, action, pending] = useActionState<SubscriptionActionState, FormData>(assignSchoolPlan, {});
  return <form action={action} className="space-y-3">
    <label className="block space-y-1 text-sm font-medium">School<select required name="schoolId" defaultValue="" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="">Select school</option>{schools.map((school)=><option key={school.id} value={school.id}>{school.label}</option>)}</select></label>
    <label className="block space-y-1 text-sm font-medium">Plan<select required name="planId" defaultValue="" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="">Select plan</option>{plans.map((plan)=><option key={plan.id} value={plan.id}>{plan.label}</option>)}</select></label>
    {state.error&&<p role="alert" className="text-sm text-rose-700">{state.error}</p>}{state.success&&<p role="status" className="text-sm text-emerald-700">{state.success}</p>}
    <button disabled={pending||!schools.length||!plans.length} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending?"Assigning…":"Assign plan"}</button>
  </form>;
}

export function CreateInvoiceForm({ schools }: { schools: Choice[] }) {
  const [state, action, pending] = useActionState<SubscriptionActionState, FormData>(createSubscriptionInvoice, {});
  return <form action={action} className="space-y-3">
    <label className="block space-y-1 text-sm font-medium">School<select required name="schoolId" defaultValue="" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="">Select school</option>{schools.map((school)=><option key={school.id} value={school.id}>{school.label}</option>)}</select></label>
    {state.error&&<p role="alert" className="text-sm text-rose-700">{state.error}</p>}{state.success&&<p role="status" className="text-sm text-emerald-700">{state.success}</p>}
    <button disabled={pending||!schools.length} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending?"Creating…":"Create invoice"}</button>
  </form>;
}

export function ConfirmInvoicePaymentForm({ invoiceId, invoiceNumber }: { invoiceId: number; invoiceNumber: string }) {
  const [state, action, pending] = useActionState<SubscriptionActionState, FormData>(confirmSubscriptionInvoice, {});
  return <AdminActionDialog label="Confirm payment" title={`Confirm ${invoiceNumber} payment`}>
    <form action={action} className="space-y-4 p-5">
      <input type="hidden" name="invoiceId" value={invoiceId}/>
      <label className="block space-y-1 text-sm font-medium">Payment method<select name="paymentMethod" defaultValue="mpesa" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="mpesa">M-Pesa</option><option value="bank">Bank transfer</option><option value="other">Other</option></select></label>
      <label className="block space-y-1 text-sm font-medium">Payment reference<input required name="paymentReference" maxLength={120} className="h-11 w-full rounded-xl border border-slate-200 px-3" placeholder="M-Pesa code or bank reference"/></label>
      {state.error&&<p role="alert" className="text-sm text-rose-700">{state.error}</p>}{state.success&&<p role="status" className="text-sm text-emerald-700">{state.success}</p>}
      <button disabled={pending} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending?"Confirming…":"Confirm payment"}</button>
    </form>
  </AdminActionDialog>;
}
