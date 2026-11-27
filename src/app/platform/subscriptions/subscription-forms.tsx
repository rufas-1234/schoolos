"use client";

import { useActionState } from "react";
import { AdminActionDialog } from "@/components/admin-data-table";
import { assignSchoolPlan, confirmSubscriptionInvoice, createSubscriptionInvoice, removeSchoolSubscription, updateSchoolSubscription, type SubscriptionActionState } from "./actions";

type Choice = { id: number; label: string };
type SchoolSubscriptionValue = {
  id: number;
  school: string;
  planId: number;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  trialEndsAt: Date | null;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
};

const dateTimeLocal = (date: Date | null) => {
  if (!date) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

export function EditSchoolSubscriptionForm({ subscription, plans }: { subscription: SchoolSubscriptionValue; plans: Choice[] }) {
  const [state, action, pending] = useActionState<SubscriptionActionState, FormData>(updateSchoolSubscription, {});
  return <AdminActionDialog label="Edit" title={`Edit ${subscription.school} subscription`}>
    <form action={action} className="space-y-4 p-5">
      <input type="hidden" name="subscriptionId" value={subscription.id}/>
      <label className="block space-y-1 text-sm font-medium">Plan<select required name="planId" defaultValue={subscription.planId} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3">{plans.map((plan)=><option key={plan.id} value={plan.id}>{plan.label}</option>)}</select></label>
      <label className="block space-y-1 text-sm font-medium">Status<select name="status" defaultValue={subscription.status} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="trialing">Trialing</option><option value="pending_payment">Pending payment</option><option value="active">Active</option><option value="past_due">Past due</option><option value="canceled">Canceled / removed</option></select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">Period starts<input type="datetime-local" name="periodStart" defaultValue={dateTimeLocal(subscription.periodStart)} className="h-11 w-full rounded-xl border border-slate-200 px-3"/></label>
        <label className="block space-y-1 text-sm font-medium">Period ends<input type="datetime-local" name="periodEnd" defaultValue={dateTimeLocal(subscription.periodEnd)} className="h-11 w-full rounded-xl border border-slate-200 px-3"/></label>
        <label className="block space-y-1 text-sm font-medium">Trial ends<input type="datetime-local" name="trialEndsAt" defaultValue={dateTimeLocal(subscription.trialEndsAt)} className="h-11 w-full rounded-xl border border-slate-200 px-3"/></label>
        <label className="block space-y-1 text-sm font-medium">Grace ends<input type="datetime-local" name="graceUntil" defaultValue={dateTimeLocal(subscription.graceUntil)} className="h-11 w-full rounded-xl border border-slate-200 px-3"/></label>
      </div>
      <input type="hidden" name="cancelAtPeriodEnd" value="false"/>
      <div className="space-y-1"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="cancelAtPeriodEnd" value="true" defaultChecked={subscription.cancelAtPeriodEnd}/>Mark to cancel at the end of this period</label><p className="text-xs text-slate-500">This records the cancellation flag; automatic period-end cancellation is not yet scheduled. To remove access now, choose Canceled / removed.</p></div>
      <p className="text-xs leading-5 text-slate-500">Changing status to Canceled removes subscription access while preserving invoices and the subscription record. Set it back to Active to restore access, subject to the dates and grace period.</p>
      {state.error&&<p role="alert" className="text-sm text-rose-700">{state.error}</p>}{state.success&&<p role="status" className="text-sm text-emerald-700">{state.success}</p>}
      <button disabled={pending} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending?"Saving…":"Save subscription"}</button>
    </form>
  </AdminActionDialog>;
}

export function RemoveSchoolSubscriptionForm({ subscriptionId, school }: { subscriptionId: number; school: string }) {
  const [state, action, pending] = useActionState<SubscriptionActionState, FormData>(removeSchoolSubscription, {});
  return <AdminActionDialog label="Remove" title={`Remove ${school} subscription`}>
    <form action={action} className="space-y-4 p-5">
      <input type="hidden" name="subscriptionId" value={subscriptionId}/>
      <p className="text-sm leading-6 text-slate-700">This removes the subscription assignment for {school}. The school will have full access without plan restrictions. Existing invoices remain in billing history.</p>
      {state.error&&<p role="alert" className="text-sm text-rose-700">{state.error}</p>}{state.success&&<p role="status" className="text-sm text-emerald-700">{state.success}</p>}
      <button disabled={pending} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending?"Removing…":"Remove subscription"}</button>
    </form>
  </AdminActionDialog>;
}

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
