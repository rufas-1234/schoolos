import { asc } from "drizzle-orm";
import { AdminActionDialog, AdminDataTable } from "@/components/admin-data-table";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { subscriptionModules } from "@/lib/subscription-policy";
import { PlanForm } from "./plan-form";

export const dynamic = "force-dynamic";

export default async function PlatformPlansPage() {
  await requirePlatformAdmin();
  const plans = await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.name));
  const moduleNames = new Map<string, string>(subscriptionModules.map((item) => [item.key, item.label]));
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-7">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-violet-700">SchoolOS platform</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Subscription plans</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Set prices, student and branch limits, trial periods, and modules. Existing schools keep their current access until you assign a plan.</p></div><AdminActionDialog label="Create paid plan" title="Create subscription plan"><div className="p-5"><PlanForm/></div></AdminActionDialog></header>
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>Billing mode: manual.</strong> Create a plan, assign it to a school, issue an invoice, then mark it paid after confirming the transfer. No payment provider is connected yet.</div>
    <AdminDataTable title="Available plans" mobileCardView columns={[{key:"name",label:"Plan"},{key:"price",label:"Price"},{key:"limits",label:"Limits"},{key:"modules",label:"Modules"},{key:"status",label:"Status"}]} rows={plans.map((plan)=>({id:plan.id,searchableText:`${plan.name} ${plan.code} ${plan.currency} ${plan.billingInterval}`,values:{name:`${plan.name}${plan.isTrial?" · Default trial":""}`,price:plan.isTrial?`${plan.trialDays} days · no charge`:`${plan.currency} ${Number(plan.amount).toLocaleString()} / ${plan.billingInterval === "yearly" ? "year" : "month"}`,limits:`${plan.studentLimit ?? "Unlimited"} students · ${plan.branchLimit ?? "Unlimited"} branches`,modules:plan.includedModules.map((key)=>key==="all"?"All modules":moduleNames.get(key)??key).join(", "),status:plan.isActive?"Available":"Archived"},actions:plan.isTrial?undefined:<AdminActionDialog label="Edit plan" title={`Edit ${plan.name} plan`}><div className="p-5"><PlanForm plan={{id:plan.id,code:plan.code,name:plan.name,description:plan.description,billingInterval:plan.billingInterval,currency:plan.currency,amount:plan.amount,studentLimit:plan.studentLimit,branchLimit:plan.branchLimit,trialDays:plan.trialDays,includedModules:plan.includedModules,isActive:plan.isActive}}/></div></AdminActionDialog>}))} emptyMessage="No plans are configured." showRowNumber={false}/>
  </main>;
}
