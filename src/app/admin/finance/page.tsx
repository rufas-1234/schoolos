import Link from "next/link";
import { ArrowUpRight, Banknote, FileChartColumn, Landmark, Package, ReceiptText } from "lucide-react";
import { requireSchoolPermission } from "@/lib/access-control";

export default async function AdminFinanceOverviewPage() {
  const context = await requireSchoolPermission([
    "accounts.manage",
    "fees.manage",
    "payments.record",
    "inventory.manage",
  ]);
  const permissions = new Set(context.grantedPermissions);
  const links = [
    ...(permissions.has("fees.manage") || permissions.has("payments.record") ? [
      { href: "/admin/fees/overview", title: "Fees overview", description: "Review fee collection, invoices, reports, and fee setup.", icon: ReceiptText },
      { href: "/admin/fees/collection", title: "Fee collection", description: "Find student invoices and record payments.", icon: Banknote },
      { href: "/admin/fees/reports", title: "Fee reports", description: "Review collections and outstanding balances.", icon: FileChartColumn },
    ] : []),
    ...(permissions.has("accounts.manage") ? [
      { href: "/admin/accounts?section=profit", title: "Accounts", description: "Manage income, expenses, bank accounts, and accounting reports.", icon: Landmark },
    ] : []),
    ...(permissions.has("inventory.manage") ? [
      { href: "/admin/inventory", title: "Inventory", description: "Review stock, suppliers, and school assets.", icon: Package },
    ] : []),
  ];

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/80 p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-violet-700">Administration</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Finance overview</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Open the finance and resource workflows available to {context.schoolName}.</p>
      </header>
      <section aria-label="Finance links" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
