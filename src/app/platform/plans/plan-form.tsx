"use client";

import { useActionState } from "react";
import { subscriptionModules } from "@/lib/subscription-policy";
import { saveSubscriptionPlan, type PlanActionState } from "./actions";

export type PlanFormValue = {
  id?: number;
  code?: string;
  name?: string;
  description?: string | null;
  billingInterval?: string;
  pricingModel?: string;
  currency?: string;
  amount?: string;
  studentLimit?: number | null;
  branchLimit?: number | null;
  trialDays?: number;
  includedModules?: string[];
  isActive?: boolean;
  sortOrder?: number;
};

export function PlanForm({ plan }: { plan?: PlanFormValue }) {
  const [state, action, pending] = useActionState<PlanActionState, FormData>(saveSubscriptionPlan, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="planId" value={plan?.id ?? ""} />
    <input type="hidden" name="sortOrder" value={plan?.sortOrder ?? 0} />
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm font-medium">Plan name<input required name="name" defaultValue={plan?.name} maxLength={120} placeholder="Core" className="h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
      <label className="space-y-1 text-sm font-medium">Plan code<input required name="code" defaultValue={plan?.code} pattern="[a-z0-9-]+" maxLength={48} placeholder="core" className="h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
      <label className="space-y-1 text-sm font-medium">Billing cycle<select name="billingInterval" defaultValue={plan?.billingInterval ?? "termly"} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="monthly">Monthly</option><option value="termly">Termly (every 3 months)</option><option value="yearly">Yearly</option></select></label>
      <label className="space-y-1 text-sm font-medium">Price basis<select name="pricingModel" defaultValue={plan?.pricingModel ?? "per_student"} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="per_student">Per student</option><option value="flat">Flat per cycle</option></select></label>
      <label className="space-y-1 text-sm font-medium">Currency<select required name="currency" defaultValue={plan?.currency ?? "USD"} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="USD">USD — US dollar</option><option value="KES">KES — Kenyan shilling</option><option value="UGX">UGX — Ugandan shilling</option><option value="TZS">TZS — Tanzanian shilling</option><option value="RWF">RWF — Rwandan franc</option><option value="NGN">NGN — Nigerian naira</option><option value="ZAR">ZAR — South African rand</option><option value="GBP">GBP — British pound</option><option value="EUR">EUR — Euro</option><option value="CAD">CAD — Canadian dollar</option><option value="AUD">AUD — Australian dollar</option></select></label>
      <label className="space-y-1 text-sm font-medium">Rate / price<input required name="amount" type="number" min="0" step="0.01" defaultValue={plan?.amount ?? "1.00"} placeholder="Set your price" className="h-11 w-full rounded-xl border border-slate-200 px-3" /><span className="block text-xs font-normal text-slate-500">This is per student each cycle when Per student is selected; otherwise it is the flat cycle price.</span></label>
      <label className="space-y-1 text-sm font-medium">Active student limit<input name="studentLimit" type="number" min="1" defaultValue={plan?.studentLimit ?? ""} placeholder="No limit" className="h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
      <label className="space-y-1 text-sm font-medium">Branch limit<input name="branchLimit" type="number" min="1" defaultValue={plan?.branchLimit ?? ""} placeholder="No limit" className="h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
      <label className="space-y-1 text-sm font-medium">Trial days before billing<input name="trialDays" type="number" min="0" max="365" defaultValue={plan?.trialDays ?? 0} className="h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
      <label className="space-y-1 text-sm font-medium sm:col-span-2">Description<textarea name="description" rows={2} maxLength={1000} defaultValue={plan?.description ?? ""} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
    </div>
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Included modules</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {subscriptionModules.map((module) => <label key={module.key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-sm">{module.key==="students"&&<input type="hidden" name="modules" value="students"/>}<input type="checkbox" name="modules" value={module.key} disabled={module.key==="students"} defaultChecked={module.key==="students"||(plan ? plan.includedModules?.includes(module.key) : true)} />{module.label}{module.key==="students"&&<span className="ml-auto text-xs text-slate-500">Always included</span>}</label>)}
      </div>
      <p className="text-xs text-slate-500">Student records and core workspace settings remain available on every plan.</p>
    </fieldset>
    <input type="hidden" name="isActive" value="false" />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" value="true" defaultChecked={plan?.isActive ?? true} />Available for new subscriptions</label>
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
    <button disabled={pending} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : plan?.id ? "Save plan" : "Create plan"}</button>
  </form>;
}
