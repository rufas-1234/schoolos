import Link from "next/link";
import { ArrowUpRight, Banknote, FileChartColumn, Files, Settings2, Tags } from "lucide-react";
import { requireSchoolPermission } from "@/lib/access-control";

export default async function FeesOverviewPage() {
  const context = await requireSchoolPermission(["fees.manage", "payments.record"]);
  const permissions = new Set(context.grantedPermissions);
  const links = [
    ...(permissions.has("payments.record") || permissions.has("fees.manage") ? [
      { href: "/admin/fees/collection", title: "Fee collection", description: "Search invoices, record payments, and print receipts.", icon: Banknote },
      { href: "/admin/fees/reports", title: "Fee reports", description: "Review payment activity and outstanding balances.", icon: FileChartColumn },
    ] : []),
    ...(permissions.has("fees.manage") ? [
      { href: "/admin/fees?section=invoices", title: "Student invoices", description: "Generate and review student invoices.", icon: Files },
      { href: "/admin/fees?section=structure", title: "Fee structure", description: "Set fee amounts by class, branch, and academic period.", icon: Settings2 },
      { href: "/admin/fees?section=discounts", title: "Scholarships and discounts", description: "Configure discounts and assign them to students.", icon: Tags },
      { href: "/admin/fees", title: "Fee setup", description: "Manage fee groups, fee types, and the fee catalog.", icon: Settings2 },
    ] : []),
  ];

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/80 p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-violet-700">Finance</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Fees overview</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Manage fee setup, student invoices, collections, and reports for {context.schoolName}.</p>
      </header>
      <section aria-label="Fee management links" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/50">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Icon size={20} aria-hidden="true" /></span>
            <span className="mt-4 flex items-center justify-between gap-3 font-semibold text-slate-900">{title}<ArrowUpRight size={16} className="text-violet-700 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" /></span>
            <span className="mt-1 block text-sm leading-5 text-slate-600">{description}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
