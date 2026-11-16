import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  assetMaintenance,
  inventoryAssets,
  inventoryCategories,
  inventoryItems,
  inventoryLocations,
  inventoryMovements,
  inventorySuppliers,
  schools,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { InventoryForms, AssetLocationForm, type InventoryOption } from "./inventory-forms";
import Link from "next/link";

export const dynamic = "force-dynamic";

function formatCurrency(value: string | number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value));
}

function formatDate(value: Date | string): string {
  return value instanceof Date ? value.toLocaleString() : value;
}

export default async function InventoryPage() {
  const context = await requireSchoolPermission("inventory.manage");
  const [
    school,
    categories,
    suppliers,
    locations,
    items,
    assets,
    movements,
    maintenance,
  ] = await Promise.all([
    db.select({ currency: schools.currency }).from(schools).where(eq(schools.id, context.schoolId)).then((rows) => rows[0]),
    db.select({ id: inventoryCategories.id, name: inventoryCategories.name, description: inventoryCategories.description })
      .from(inventoryCategories).where(eq(inventoryCategories.schoolId, context.schoolId)).orderBy(asc(inventoryCategories.name)),
    db.select({
      id: inventorySuppliers.id,
      name: inventorySuppliers.name,
      contactName: inventorySuppliers.contactName,
      email: inventorySuppliers.email,
      phone: inventorySuppliers.phone,
      address: inventorySuppliers.address,
    }).from(inventorySuppliers).where(eq(inventorySuppliers.schoolId, context.schoolId)).orderBy(asc(inventorySuppliers.name)),
    db.select({ id: inventoryLocations.id, name: inventoryLocations.name, description: inventoryLocations.description })
      .from(inventoryLocations).where(eq(inventoryLocations.schoolId, context.schoolId)).orderBy(asc(inventoryLocations.name)),
    db.select({
      id: inventoryItems.id,
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      description: inventoryItems.description,
      unit: inventoryItems.unit,
      quantityOnHand: inventoryItems.quantityOnHand,
      reorderLevel: inventoryItems.reorderLevel,
      averageUnitCost: inventoryItems.averageUnitCost,
      status: inventoryItems.status,
      categoryName: inventoryCategories.name,
      supplierName: inventorySuppliers.name,
      locationName: inventoryLocations.name,
    }).from(inventoryItems)
      .innerJoin(inventoryCategories, and(
        eq(inventoryCategories.id, inventoryItems.categoryId),
        eq(inventoryCategories.schoolId, context.schoolId),
      ))
      .leftJoin(inventorySuppliers, and(
        eq(inventorySuppliers.id, inventoryItems.supplierId),
        eq(inventorySuppliers.schoolId, context.schoolId),
      ))
      .leftJoin(inventoryLocations, and(
        eq(inventoryLocations.id, inventoryItems.locationId),
        eq(inventoryLocations.schoolId, context.schoolId),
      ))
      .where(eq(inventoryItems.schoolId, context.schoolId))
      .orderBy(asc(inventoryItems.name)),
    db.select({
      id: inventoryAssets.id,
      assetTag: inventoryAssets.assetTag,
      name: inventoryAssets.name,
      description: inventoryAssets.description,
      acquiredAt: inventoryAssets.acquiredAt,
      acquisitionCost: inventoryAssets.acquisitionCost,
      status: inventoryAssets.status,
      locationId: inventoryAssets.locationId,
      locationName: inventoryLocations.name,
    }).from(inventoryAssets)
      .leftJoin(inventoryLocations, and(
        eq(inventoryLocations.id, inventoryAssets.locationId),
        eq(inventoryLocations.schoolId, context.schoolId),
      ))
      .where(eq(inventoryAssets.schoolId, context.schoolId))
      .orderBy(asc(inventoryAssets.assetTag)),
    db.select({
      itemName: inventoryItems.name,
      sku: inventoryItems.sku,
      unit: inventoryItems.unit,
      movementType: inventoryMovements.movementType,
      quantity: inventoryMovements.quantity,
      quantityAfter: inventoryMovements.quantityAfter,
      unitCost: inventoryMovements.unitCost,
      reference: inventoryMovements.reference,
      createdAt: inventoryMovements.createdAt,
    }).from(inventoryMovements)
      .innerJoin(inventoryItems, and(
        eq(inventoryItems.id, inventoryMovements.itemId),
        eq(inventoryItems.schoolId, context.schoolId),
      ))
      .where(eq(inventoryMovements.schoolId, context.schoolId))
      .orderBy(desc(inventoryMovements.createdAt)).limit(50),
    db.select({
      assetTag: inventoryAssets.assetTag,
      assetName: inventoryAssets.name,
      maintenanceDate: assetMaintenance.maintenanceDate,
      description: assetMaintenance.description,
      cost: assetMaintenance.cost,
      performedBy: assetMaintenance.performedBy,
    }).from(assetMaintenance)
      .innerJoin(inventoryAssets, and(
        eq(inventoryAssets.id, assetMaintenance.assetId),
        eq(inventoryAssets.schoolId, context.schoolId),
      ))
      .where(eq(assetMaintenance.schoolId, context.schoolId))
      .orderBy(desc(assetMaintenance.maintenanceDate)).limit(50),
  ]);
  const options = <T extends { id: number }>(rows: T[], label: (row: T) => string): InventoryOption[] =>
    rows.map((row) => ({ id: row.id, label: label(row) }));
  const categoryOptions = options(categories, (row) => row.name);
  const supplierOptions = options(suppliers, (row) => row.name);
  const locationOptions = options(locations, (row) => row.name);
  const itemOptions = options(items.filter((item) => item.status === "active"), (row) => `${row.sku} · ${row.name}`);
  const assetOptions = options(assets.filter((asset) => asset.status !== "retired"), (row) => `${row.assetTag} · ${row.name}`);
  const lowStock = items.filter((item) => item.status === "active" && Number(item.quantityOnHand) <= Number(item.reorderLevel));
  const stockValue = items.reduce((total, item) =>
    total + Number(item.quantityOnHand) * Number(item.averageUnitCost), 0);
  const hasDemoRows = items.some((item) => item.name.startsWith("DEMO TEST ONLY - "))
    || assets.some((asset) => asset.name.startsWith("DEMO TEST ONLY - "));
  const currency = school?.currency ?? "USD";

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm font-semibold text-violet-700">Operations</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">Inventory &amp; Assets</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Track supplies from receipt to issue, monitor reorder levels, and maintain a register of school assets and repairs.
        </p>
        <Link href="/admin/inventory/reports" className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">View inventory reports</Link>
      </header>
      {hasDemoRows && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">DEMO TEST ONLY items and assets are included in these counts and values as workflow examples; they are not real stock or school property.</p>}

      <section aria-label="Inventory overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active items" value={String(items.filter((item) => item.status === "active").length)} />
        <Metric label="Low stock" value={String(lowStock.length)} tone={lowStock.length ? "amber" : "normal"} />
        <Metric label="Stock on hand value" value={formatCurrency(stockValue, currency)} />
        <Metric label="Registered assets" value={String(assets.length)} />
      </section>

      {lowStock.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-950">Low-stock notification</h2>
          <p className="mt-1 text-sm text-amber-900">Items at or below their configured reorder level need attention.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {lowStock.map((item) => (
              <li key={item.id} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-950">
                <strong>{item.name}</strong> · {item.quantityOnHand} {item.unit} remaining (reorder at {item.reorderLevel})
              </li>
            ))}
          </ul>
        </section>
      )}

      <InventoryForms categories={categoryOptions} suppliers={supplierOptions} locations={locationOptions} items={itemOptions} assets={assetOptions} />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold text-slate-900">Stock register</h2>
          <p className="mt-1 text-sm text-slate-500">Current quantities and average acquisition cost by item.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
              <th className="px-4 py-3">Item</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">On hand</th>
              <th className="px-4 py-3">Reorder level</th><th className="px-4 py-3">Avg. unit cost</th><th className="px-4 py-3">Supplier / location</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className={Number(item.quantityOnHand) <= Number(item.reorderLevel) ? "bg-amber-50/60" : ""}>
                  <td className="px-4 py-3"><strong>{item.name}</strong><span className="block text-xs text-slate-500">{item.sku} · {item.status}</span></td>
                  <td className="px-4 py-3">{item.categoryName}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{item.quantityOnHand} {item.unit}</td>
                  <td className="px-4 py-3 tabular-nums">{item.reorderLevel}</td>
                  <td className="px-4 py-3">{formatCurrency(item.averageUnitCost, currency)}</td>
                  <td className="px-4 py-3">{item.supplierName ?? "—"}<span className="block text-xs text-slate-500">{item.locationName ?? "No location"}</span></td>
                </tr>
              ))}
              {!items.length && <EmptyRow columns={6} text="No inventory items have been registered." />}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold text-slate-900">School asset register</h2>
          <p className="mt-1 text-sm text-slate-500">Record asset movements, lifecycle status, and maintenance history.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
              <th className="px-4 py-3">Asset</th><th className="px-4 py-3">Acquired</th><th className="px-4 py-3">Cost</th>
              <th className="px-4 py-3">Location &amp; status</th><th className="px-4 py-3">Update asset</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td className="px-4 py-3"><strong>{asset.name}</strong><span className="block text-xs text-slate-500">{asset.assetTag}</span></td>
                  <td className="px-4 py-3">{asset.acquiredAt}</td>
                  <td className="px-4 py-3">{formatCurrency(asset.acquisitionCost, currency)}</td>
                  <td className="px-4 py-3">{asset.locationName ?? "Unassigned"}<span className="block text-xs capitalize text-slate-500">{asset.status}</span></td>
                  <td className="px-4 py-3"><AssetLocationForm assetId={asset.id} locations={locationOptions} currentLocationId={asset.locationId} currentStatus={asset.status} /></td>
                </tr>
              ))}
              {!assets.length && <EmptyRow columns={5} text="No school assets have been registered." />}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5"><h2 className="text-lg font-bold text-slate-900">Recent stock movements</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date / item</th><th className="px-4 py-3">Movement</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Balance</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((movement, index) => (
                  <tr key={`${movement.itemName}-${movement.createdAt.toISOString()}-${index}`}>
                    <td className="px-4 py-3">{formatDate(movement.createdAt)}<span className="block text-xs text-slate-500">{movement.itemName} · {movement.sku}</span></td>
                    <td className="px-4 py-3 capitalize">{movement.movementType}</td>
                    <td className="px-4 py-3 tabular-nums">{movement.quantity} {movement.unit}</td>
                    <td className="px-4 py-3 tabular-nums">{movement.quantityAfter} {movement.unit}</td>
                  </tr>
                ))}
                {!movements.length && <EmptyRow columns={4} text="No stock movements have been recorded." />}
              </tbody>
            </table>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5"><h2 className="text-lg font-bold text-slate-900">Asset maintenance log</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date / asset</th><th className="px-4 py-3">Work performed</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Provider</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {maintenance.map((record, index) => (
                  <tr key={`${record.assetTag}-${record.maintenanceDate}-${index}`}>
                    <td className="px-4 py-3">{record.maintenanceDate}<span className="block text-xs text-slate-500">{record.assetTag} · {record.assetName}</span></td>
                    <td className="px-4 py-3">{record.description}</td>
                    <td className="px-4 py-3">{formatCurrency(record.cost, currency)}</td>
                    <td className="px-4 py-3">{record.performedBy ?? "—"}</td>
                  </tr>
                ))}
                {!maintenance.length && <EmptyRow columns={4} text="No maintenance has been logged." />}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "amber" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return <tr><td colSpan={columns} className="px-4 py-8 text-center text-sm text-slate-500">{text}</td></tr>;
}
