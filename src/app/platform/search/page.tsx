import Link from "next/link";
import { and, desc, eq, isNull, like, or } from "drizzle-orm";
import { ArrowUpRight, Building2, CreditCard, FileText, Search, Users, Wallet } from "lucide-react";
import { db } from "@/db";
import { schoolMemberships, schools, staffMembers, staffPayrollRecords, subscriptionInvoices, subscriptionPlans, schoolSubscriptions, user } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
type SearchParams = { q?: string | string[] };
type Result = { id: string; type: string; title: string; detail: string; href: string; icon: typeof Building2 };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function PlatformGlobalSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformAdmin();
  const query = first((await searchParams).q).trim().slice(0, 100);
  if (query.length < 2) return <main className="min-h-full bg-slate-50 px-4 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-5xl"><h1 className="text-3xl font-bold">Platform search</h1><p className="mt-2 text-slate-600">Enter at least two characters to search workspaces, accounts, plans, subscriptions, invoices, and payroll.</p></div></main>;
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const [workspaceRows, accountRows, planRows, subscriptionRows, invoiceRows, payrollRows] = await Promise.all([
    db.select({ id: schools.id, publicId: schools.publicId, name: schools.name, email: schools.email, phone: schools.phone, status: schools.status, archivedAt: schools.archivedAt }).from(schools)
      .where(and(isNull(schools.deletedAt), or(like(schools.name, pattern), like(schools.email, pattern), like(schools.phone, pattern), like(schools.publicId, pattern)))).orderBy(desc(schools.createdAt)).limit(8),
    db.select({ id: user.id, name: user.name, email: user.email, school: schools.name }).from(schoolMemberships)
      .innerJoin(user, eq(user.id, schoolMemberships.userId)).innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
      .where(and(isNull(schools.deletedAt), or(like(user.name, pattern), like(user.email, pattern), like(schools.name, pattern)))).orderBy(user.name).limit(8),
    db.select({ id: subscriptionPlans.id, name: subscriptionPlans.name, code: subscriptionPlans.code, currency: subscriptionPlans.currency, amount: subscriptionPlans.amount, interval: subscriptionPlans.billingInterval }).from(subscriptionPlans)
      .where(or(like(subscriptionPlans.name, pattern), like(subscriptionPlans.code, pattern), like(subscriptionPlans.currency, pattern))).orderBy(subscriptionPlans.sortOrder, subscriptionPlans.name).limit(8),
    db.select({ id: schoolSubscriptions.id, schoolId: schools.id, school: schools.name, plan: subscriptionPlans.name, status: schoolSubscriptions.status }).from(schoolSubscriptions)
      .innerJoin(schools, eq(schools.id, schoolSubscriptions.schoolId)).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, schoolSubscriptions.planId))
      .where(or(like(schools.name, pattern), like(subscriptionPlans.name, pattern), like(schoolSubscriptions.status, pattern))).orderBy(schools.name).limit(8),
    db.select({ id: subscriptionInvoices.id, school: schools.name, number: subscriptionInvoices.invoiceNumber, status: subscriptionInvoices.status, reference: subscriptionInvoices.paymentReference, amount: subscriptionInvoices.amount, currency: subscriptionInvoices.currency }).from(subscriptionInvoices)
      .innerJoin(schools, eq(schools.id, subscriptionInvoices.schoolId))
      .where(or(like(schools.name, pattern), like(subscriptionInvoices.invoiceNumber, pattern), like(subscriptionInvoices.status, pattern), like(subscriptionInvoices.paymentReference, pattern))).orderBy(desc(subscriptionInvoices.createdAt)).limit(8),
    db.select({ id: staffPayrollRecords.id, publicId: staffPayrollRecords.publicId, school: schools.name, firstName: staffMembers.firstName, lastName: staffMembers.lastName, code: staffMembers.employeeCode, period: staffPayrollRecords.payPeriod }).from(staffPayrollRecords)
      .innerJoin(schools, eq(schools.id, staffPayrollRecords.schoolId)).innerJoin(staffMembers, and(eq(staffMembers.id, staffPayrollRecords.staffId), eq(staffMembers.schoolId, staffPayrollRecords.schoolId)))
      .where(or(like(schools.name, pattern), like(staffMembers.firstName, pattern), like(staffMembers.lastName, pattern), like(staffMembers.employeeCode, pattern), like(staffPayrollRecords.payPeriod, pattern))).orderBy(desc(staffPayrollRecords.payPeriod)).limit(8),
  ]);
  const encode = (value: string) => encodeURIComponent(value);
  const results: Result[] = [
    ...workspaceRows.map((item) => ({ id: `school-${item.id}`, type: "Workspace", title: item.name, detail: [item.email, item.phone, item.archivedAt ? "Archived" : item.status].filter(Boolean).join(" · "), href: `/platform/schools?search=${encode(item.name)}#${item.publicId}`, icon: Building2 })),
    ...accountRows.map((item) => ({ id: `account-${item.id}-${item.school}`, type: "School account", title: item.name, detail: `${item.email} · ${item.school}`, href: `/platform/accounts?search=${encode(item.email)}`, icon: Users })),
    ...planRows.map((item) => ({ id: `plan-${item.id}`, type: "Subscription plan", title: item.name, detail: `${item.code} · ${item.currency} ${Number(item.amount).toLocaleString()} / ${item.interval}`, href: `/platform/plans?search=${encode(item.name)}`, icon: CreditCard })),
    ...subscriptionRows.map((item) => ({ id: `subscription-${item.id}`, type: "Subscription", title: item.school, detail: `${item.plan} · ${item.status.replaceAll("_", " ")}`, href: `/platform/subscriptions?search=${encode(item.school)}#school-subscriptions`, icon: Wallet })),
    ...invoiceRows.map((item) => ({ id: `invoice-${item.id}`, type: "Billing invoice", title: item.number, detail: `${item.school} · ${item.currency} ${Number(item.amount).toLocaleString()} · ${item.status}${item.reference ? ` · ${item.reference}` : ""}`, href: `/platform/subscriptions?search=${encode(item.number)}#platform-invoices`, icon: FileText })),
    ...payrollRows.map((item) => ({ id: `payroll-${item.id}`, type: "Staff payroll", title: `${item.firstName} ${item.lastName}`, detail: `${item.school} · ${item.code} · ${item.period}`, href: `/platform/payroll?search=${encode(`${item.firstName} ${item.lastName}`)}`, icon: Wallet })),
  ];
  return <main className="min-h-full bg-slate-50 px-4 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">SchoolOS platform</p><h1 className="mt-2 text-3xl font-bold">Search results</h1><p className="mt-2 text-sm text-slate-600">Results for <span className="font-semibold text-slate-900">“{query}”</span></p></header>
    {results.length ? <div className="grid gap-3 sm:grid-cols-2">{results.map((result) => {
      const Icon = result.icon;
      return <Link key={result.id} href={result.href} className="group flex min-w-0 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Icon size={20}/></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase tracking-wide text-violet-700">{result.type}</span><span className="mt-1 block break-words font-semibold text-slate-900">{result.title}</span><span className="mt-1 block break-words text-sm leading-5 text-slate-500">{result.detail}</span></span><ArrowUpRight size={17} className="shrink-0 text-slate-400 transition group-hover:text-violet-700"/></Link>;
    })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Search className="mx-auto text-slate-400"/><h2 className="mt-3 font-semibold">No matching platform records</h2><p className="mt-1 text-sm text-slate-500">Try a school name, contact, invoice number, plan, staff name, or employee number.</p></div>}
  </div></main>;
}
