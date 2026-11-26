"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Mode = "finance" | "fees";

export function FinanceOverviewNavigation({
  mode,
  canManageFees,
  canManageFeeSetup,
  canManageAccounts,
  canManageInventory,
}: {
  mode: Mode;
  canManageFees: boolean;
  canManageFeeSetup: boolean;
  canManageAccounts: boolean;
  canManageInventory: boolean;
}) {
  const router = useRouter();
  const options = mode === "fees"
    ? [
      { href: "/admin/fees/overview", label: "Fees overview" },
      ...(canManageFees ? [
        { href: "/admin/fees/collection", label: "Fee collection" },
        { href: "/admin/fees/reports", label: "Fee reports" },
      ] : []),
      ...(canManageFeeSetup ? [
        { href: "/admin/fees", label: "Fee setup" },
        { href: "/admin/fees?section=discounts", label: "Scholarships & discounts" },
        { href: "/admin/fees?section=invoices", label: "Student invoices" },
      ] : []),
    ]
    : [
      { href: "/admin/finance", label: "Finance overview" },
      ...(canManageFees ? [
        { href: "/admin/fees/overview", label: "Fees overview" },
        { href: "/admin/fees/collection", label: "Fee collection" },
        { href: "/admin/fees/reports", label: "Fee reports" },
      ] : []),
      ...(canManageAccounts ? [
        { href: "/admin/accounts?section=profit", label: "Accounts" },
        { href: "/admin/accounts?section=income", label: "Income" },
        { href: "/admin/accounts?section=expenses", label: "Expenses" },
        { href: "/admin/accounts?section=bank", label: "Bank accounts" },
      ] : []),
      ...(canManageInventory ? [{ href: "/admin/inventory", label: "Inventory" }] : []),
    ];

  return (
    <>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700 lg:hidden">
        {mode === "fees" ? "Fees section" : "Finance section"}
        <select
          aria-label={mode === "fees" ? "Fees section" : "Finance section"}
          value={mode === "fees" ? "/admin/fees/overview" : "/admin/finance"}
          onChange={(event) => router.push(event.currentTarget.value)}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold text-slate-800 shadow-sm"
        >
          {options.map((option) => <option key={option.href} value={option.href}>{option.label}</option>)}
        </select>
      </label>
      <nav aria-label={mode === "fees" ? "Fee sections" : "Finance sections"} className="hidden flex-wrap gap-2 lg:flex">
        {options.map((option, index) => (
          <Link
            key={option.href}
            href={option.href}
            aria-current={index === 0 ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${index === 0 ? "bg-violet-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {option.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
