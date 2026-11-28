import { asc } from "drizzle-orm";
import { AdminActionDialog, AdminDataTable } from "@/components/admin-data-table";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { subscriptionModules } from "@/lib/subscription-policy";
import { PlanForm } from "./plan-form";

export const dynamic = "force-dynamic";

export default async function PlatformPlansPage({ searchParams }: { searchParams: Promise<{ search?: string | string[] }> }) {
  await requirePlatformAdmin();
  const requestedSearch = (await searchParams).search;
  const search = (Array.isArray(requestedSearch) ? requestedSearch[0] : requestedSearch ?? "").trim().toLocaleLowerCase();
  const allPlans = await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.name));
  const plans = allPlans.filter((plan) => !search || `${plan.name} ${plan.code} ${plan.currency} ${plan.billingInterval}`.toLocaleLowerCase().includes(search));
  const moduleNames = new Map<string, string>(subscriptionModules.map((item) => [item.key, item.label]));
  return <main className="min-h-[calc(100vh-76px)] bg-slate-50 px-4 py-7 text-slate-900 dark:bg-slate-50 dark:text-slate-900 sm:px-7"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-violet-700">SchoolOS platform</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Subscription plans</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Set prices, student and branch limits, trial periods, and modules. Existing schools keep their current access until you assign a plan.</p></div><AdminActionDialog label="Create paid plan" title="Create subscription plan"><div className="p-5"><PlanForm/></div></AdminActionDialog></header>
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>Billing mode: manual.</strong> Four USD termly tiers are available at $1 per enrolled student per term. They are not assigned to any school. Invoice totals use the school’s enrolled student count for that cycle. Create or edit plans here, then assign one when ready; paid invoices are confirmed after the transfer. No payment provider is connected yet.</div>
    {search && <p className="text-sm text-slate-600">Filtered by <strong>{search}</strong> · <a href="/platform/plans" className="font-semibold text-violet-700">Clear search</a></p>}
    <AdminDataTable title="Available plans" mobileCardView columns={[{key:"name",label:"Plan"},{key:"price",label:"Price"},{key:"limits",label:"Limits"},{key:"modules",label:"Modules"},{key:"status",label:"Status"}]} rows={plans.map((plan)=>({id:plan.id,searchableText:`${plan.name} ${plan.code} ${plan.currency} ${plan.billingInterval}`,values:{name:`${plan.name}${plan.isTrial?" · Default trial":""}`,price:plan.isTrial?`${plan.trialDays} days · no charge`:`${plan.currency} ${Number(plan.amount).toLocaleString()}${plan.pricingModel==="per_student"?" / student":""} / ${plan.billingInterval === "yearly" ? "year" : plan.billingInterval === "termly" ? "term" : "month"}`,limits:`${plan.studentLimit ?? "Unlimited"} students · ${plan.branchLimit ?? "Unlimited"} branches`,modules:plan.includedModules.map((key)=>key==="all"?"All modules":moduleNames.get(key)??key).join(", "),status:plan.isActive?"Available":"Archived"},actions:plan.isTrial?undefined:<AdminActionDialog label="Edit plan" title={`Edit ${plan.name} plan`}><div className="p-5"><PlanForm plan={{id:plan.id,code:plan.code,name:plan.name,description:plan.description,billingInterval:plan.billingInterval,pricingModel:plan.pricingModel,currency:plan.currency,amount:plan.amount,studentLimit:plan.studentLimit,branchLimit:plan.branchLimit,trialDays:plan.trialDays,includedModules:plan.includedModules,isActive:plan.isActive}}/></div></AdminActionDialog>}))} emptyMessage="No plans are configured." showRowNumber={false}/>
  </div></main>;
}
