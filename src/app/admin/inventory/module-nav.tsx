import Link from "next/link";

type ModuleSection = "inventory" | "accounts" | "assets" | "expenses" | "reports";

const sections: Array<{
  id: ModuleSection;
  label: string;
  href: string;
  permission: "inventory.manage" | "accounts.manage" | "either";
}> = [
  { id: "inventory", label: "Inventory", href: "/admin/inventory", permission: "inventory.manage" },
  { id: "accounts", label: "Accounts", href: "/admin/accounts?section=profit", permission: "accounts.manage" },
  { id: "assets", label: "Assets", href: "/admin/inventory?section=assets", permission: "inventory.manage" },
  { id: "expenses", label: "Expenses", href: "/admin/accounts?section=expenses", permission: "accounts.manage" },
  { id: "reports", label: "Reports", href: "/admin/inventory/reports", permission: "either" },
];

export function InventoryModuleNav({ active, permissions }: { active: ModuleSection; permissions: string[] }) {
  const canManageInventory = permissions.includes("inventory.manage");
  return (
    <nav aria-label="Inventory module" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 print:hidden">
      <div className="flex min-w-max gap-1">
        {sections.filter((section) =>
          section.permission === "either" ||
          permissions.includes(section.permission),
        ).map((section) => (
          <Link
            key={section.id}
            href={section.id === "reports" && !canManageInventory
              ? "/admin/accounts?section=reports"
              : section.href}
            aria-current={active === section.id ? "page" : undefined}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
              active === section.id
                ? "bg-violet-700 text-white shadow-sm"
                : "text-slate-600 hover:bg-violet-50 hover:text-violet-800"
            }`}
          >
            {section.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
