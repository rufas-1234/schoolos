import Link from "next/link";
import { ChevronDown } from "lucide-react";

type ModuleSection = "setup" | "register" | "movements" | "chart" | "profit" | "bank" | "transfers" | "assets" | "maintenance" | "income" | "expenses" | "reports";

const inventoryLinks: Array<{ id: "setup" | "register" | "movements"; label: string; href: string }> = [
  { id: "setup", label: "Inventory setup", href: "/admin/inventory?view=setup" },
  { id: "register", label: "Stock register", href: "/admin/inventory?view=register" },
  { id: "movements", label: "Stock movement & history", href: "/admin/inventory?view=movements" },
];

export function InventoryModuleNav({
  active,
  permissions,
  reportsHref,
}: {
  active: ModuleSection;
  permissions: string[];
  reportsHref?: string;
}) {
  const canManageInventory = permissions.includes("inventory.manage");
  const canManageAccounts = permissions.includes("accounts.manage");
  return (
    <nav aria-label="Inventory and accounts" className="flex flex-wrap items-start gap-2 rounded-2xl border border-slate-200 bg-white p-2 print:hidden">
      {canManageInventory && (
        <details open={active === "setup" || active === "register" || active === "movements"} className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-800">
            Inventory <ChevronDown aria-hidden="true" size={15} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute left-0 z-30 mt-1 grid min-w-56 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {inventoryLinks.map((section) => (
              <Link
                key={section.id}
                href={section.href}
                aria-current={active === section.id ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${active === section.id ? "bg-violet-700 text-white" : "text-slate-700 hover:bg-violet-50"}`}
              >
                {section.label}
              </Link>
            ))}
          </div>
        </details>
      )}
      {canManageAccounts && (
        <>
          {[
            { id: "chart", label: "Chart of accounts", href: "/admin/accounts?section=chart" },
            { id: "profit", label: "Profit & loss", href: "/admin/accounts?section=profit" },
            { id: "bank", label: "Bank accounts", href: "/admin/accounts?section=bank" },
            { id: "transfers", label: "Fund transfers", href: "/admin/accounts?section=transfers" },
          ].map((section) => (
            <Link
              key={section.id}
              href={section.href}
              aria-current={active === section.id ? "page" : undefined}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active === section.id ? "bg-violet-700 text-white shadow-sm" : "text-slate-600 hover:bg-violet-50 hover:text-violet-800"}`}
            >
              {section.label}
            </Link>
          ))}
        </>
      )}
      {canManageInventory && (
        <details open={active === "assets" || active === "maintenance"} className="group relative">
          <summary className={`flex cursor-pointer list-none items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${active === "assets" || active === "maintenance" ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 text-slate-700 hover:bg-violet-50 hover:text-violet-800"}`}>
            Assets <ChevronDown aria-hidden="true" size={15} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute left-0 z-30 mt-1 grid min-w-48 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            <Link href="/admin/inventory?view=assets" aria-current={active === "assets" ? "page" : undefined} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-violet-50">
              Asset register
            </Link>
            <Link href="/admin/inventory?view=maintenance" aria-current={active === "maintenance" ? "page" : undefined} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-violet-50">
              Asset maintenance
            </Link>
          </div>
        </details>
      )}
      {canManageAccounts && [
        { id: "income", label: "Income", href: "/admin/accounts?section=income" },
        { id: "expenses", label: "Expenses", href: "/admin/accounts?section=expenses" },
      ].map((section) => (
          <Link
            key={section.id} href={section.href}
            aria-current={active === section.id ? "page" : undefined}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active === section.id ? "bg-violet-700 text-white shadow-sm" : "text-slate-600 hover:bg-violet-50 hover:text-violet-800"}`}
          >
            {section.label}
          </Link>
      ))}
      {(canManageInventory || canManageAccounts) && (
        <Link
          href={reportsHref ?? (canManageInventory ? "/admin/inventory/reports" : "/admin/accounts?section=reports")}
          aria-current={active === "reports" ? "page" : undefined}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active === "reports" ? "bg-violet-700 text-white shadow-sm" : "text-slate-600 hover:bg-violet-50 hover:text-violet-800"}`}
        >
          Reports
        </Link>
      )}
    </nav>
  );
}
