import Link from "next/link";

type ModuleSection = "setup" | "register" | "movements" | "assets" | "maintenance" | "reports";

const inventoryLinks: Array<{ id: "register" | "movements" | "setup"; label: string; href: string }> = [
  { id: "register", label: "Items", href: "/admin/inventory?view=register" },
  { id: "movements", label: "Stock movements", href: "/admin/inventory?view=movements" },
  { id: "setup", label: "Setup", href: "/admin/inventory?view=setup" },
];

export function InventoryModuleNav({
  active,
  permissions,
}: {
  active: ModuleSection;
  permissions: string[];
}) {
  const canManageInventory = permissions.includes("inventory.manage");
  if (!canManageInventory) return null;

  return (
    <nav aria-label="Inventory" className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 print:hidden">
      {inventoryLinks.map((section) => (
        <Link
          key={section.id}
          href={section.href}
          aria-current={active === section.id ? "page" : undefined}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            active === section.id
              ? "bg-violet-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-violet-50 hover:text-violet-800"
          }`}
        >
          {section.label}
        </Link>
      ))}
      <Link
        href="/admin/inventory/reports"
        aria-current={active === "reports" ? "page" : undefined}
        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          active === "reports"
            ? "bg-violet-700 text-white shadow-sm"
            : "text-slate-600 hover:bg-violet-50 hover:text-violet-800"
        }`}
      >
        Reports
      </Link>
      <details className="group relative">
        <summary className="cursor-pointer list-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          More
        </summary>
        <div className="absolute left-0 z-30 mt-1 grid min-w-48 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <Link
            href="/admin/inventory?view=assets"
            aria-current={active === "assets" ? "page" : undefined}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-violet-50"
          >
            Asset register
          </Link>
          <Link
            href="/admin/inventory?view=maintenance"
            aria-current={active === "maintenance" ? "page" : undefined}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-violet-50"
          >
            Asset maintenance
          </Link>
        </div>
      </details>
    </nav>
  );
}
