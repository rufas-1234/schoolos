import Link from "next/link";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
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
import { DownloadCsv } from "@/components/download-csv";
import { PrintReportButton } from "@/app/admin/hr/reports/print-report-button";
import { InventoryModuleNav } from "@/app/admin/inventory/module-nav";
import { TablePagination } from "@/components/table-pagination";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { parsePageSize } from "@/components/pagination-utils";

export const dynamic = "force-dynamic";
type SearchParams = {
  report?: string | string[];
  from?: string | string[];
  to?: string | string[];
  categoryId?: string | string[];
  search?: string | string[];
  movementType?: string | string[];
  status?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
};
type ReportType = "stock" | "movements" | "low-stock" | "assets" | "maintenance";

const reports: Array<{ id: ReportType; label: string }> = [
  { id: "stock", label: "Stock on hand" },
  { id: "movements", label: "Stock movements" },
  { id: "low-stock", label: "Low stock" },
  { id: "assets", label: "Asset register" },
  { id: "maintenance", label: "Maintenance" },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestedPage(value: string | undefined): number {
  return value && /^\d+$/.test(value) ? Math.max(1, Number(value)) : 1;
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatCurrency(value: string | number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value));
}

function formatDate(value: Date | string): string {
  return value instanceof Date ? value.toLocaleString() : value;
}

export default async function InventoryReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await requireSchoolPermission("inventory.manage");
  const query = await searchParams;
  const pageSize = parsePageSize(query.pageSize);
  const selectedReport = first(query.report);
  const report: ReportType = reports.some((item) => item.id === selectedReport)
    ? selectedReport as ReportType
    : "stock";
  const today = new Date().toISOString().slice(0, 10);
  const fromCandidate = first(query.from);
  const toCandidate = first(query.to);
  const defaultFrom = `${today.slice(0, 4)}-01-01`;
  const fromValue = validDate(fromCandidate) ? fromCandidate : defaultFrom;
  const toValue = validDate(toCandidate) ? toCandidate : today;
  const from = toValue >= fromValue ? fromValue : defaultFrom;
  const to = toValue >= fromValue ? toValue : today;
  const requestedCategoryId = Number(first(query.categoryId));
  const categoryId = Number.isSafeInteger(requestedCategoryId) && requestedCategoryId > 0
    ? requestedCategoryId
    : null;
  const search = first(query.search)?.trim().slice(0, 120) ?? "";
  const searchTerm = search.toLocaleLowerCase();
  const requestedMovementType = first(query.movementType);
  const movementType = requestedMovementType === "received" || requestedMovementType === "issued" || requestedMovementType === "adjustment"
    ? requestedMovementType
    : "all";
  const requestedAssetStatus = first(query.status);
  const assetStatus = requestedAssetStatus === "active" || requestedAssetStatus === "maintenance" || requestedAssetStatus === "retired"
    ? requestedAssetStatus
    : "all";
  const requestedPageNumber = requestedPage(first(query.page));
  const startAt = new Date(`${from}T00:00:00.000Z`);
  const endAt = new Date(`${to}T23:59:59.999Z`);
  const [school, categories, items, movements, assets, maintenance] = await Promise.all([
    db.select({ currency: schools.currency }).from(schools).where(eq(schools.id, context.schoolId)).then((rows) => rows[0]),
    db.select({ id: inventoryCategories.id, name: inventoryCategories.name })
      .from(inventoryCategories).where(eq(inventoryCategories.schoolId, context.schoolId)).orderBy(asc(inventoryCategories.name)),
    db.select({
      id: inventoryItems.id,
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      unit: inventoryItems.unit,
      quantityOnHand: inventoryItems.quantityOnHand,
      reorderLevel: inventoryItems.reorderLevel,
      averageUnitCost: inventoryItems.averageUnitCost,
      status: inventoryItems.status,
      categoryId: inventoryItems.categoryId,
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
      .where(and(
        eq(inventoryItems.schoolId, context.schoolId),
        ...(categoryId === null ? [] : [eq(inventoryItems.categoryId, categoryId)]),
      ))
      .orderBy(asc(inventoryItems.name), asc(inventoryItems.id)),
    db.select({
      id: inventoryMovements.id,
      itemName: inventoryItems.name,
      sku: inventoryItems.sku,
      unit: inventoryItems.unit,
      categoryName: inventoryCategories.name,
      movementType: inventoryMovements.movementType,
      quantity: inventoryMovements.quantity,
      quantityBefore: inventoryMovements.quantityBefore,
      quantityAfter: inventoryMovements.quantityAfter,
      unitCost: inventoryMovements.unitCost,
      reference: inventoryMovements.reference,
      note: inventoryMovements.note,
      createdAt: inventoryMovements.createdAt,
    }).from(inventoryMovements)
      .innerJoin(inventoryItems, and(
        eq(inventoryItems.id, inventoryMovements.itemId),
        eq(inventoryItems.schoolId, context.schoolId),
      ))
      .innerJoin(inventoryCategories, and(
        eq(inventoryCategories.id, inventoryItems.categoryId),
        eq(inventoryCategories.schoolId, context.schoolId),
      ))
      .where(and(
        eq(inventoryMovements.schoolId, context.schoolId),
        gte(inventoryMovements.createdAt, startAt),
        lte(inventoryMovements.createdAt, endAt),
        ...(categoryId === null ? [] : [eq(inventoryItems.categoryId, categoryId)]),
      ))
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id)),
    db.select({
      assetTag: inventoryAssets.assetTag,
      name: inventoryAssets.name,
      description: inventoryAssets.description,
      acquiredAt: inventoryAssets.acquiredAt,
      acquisitionCost: inventoryAssets.acquisitionCost,
      status: inventoryAssets.status,
      locationName: inventoryLocations.name,
    }).from(inventoryAssets)
      .leftJoin(inventoryLocations, and(
        eq(inventoryLocations.id, inventoryAssets.locationId),
        eq(inventoryLocations.schoolId, context.schoolId),
      ))
      .where(and(
        eq(inventoryAssets.schoolId, context.schoolId),
        gte(inventoryAssets.acquiredAt, from),
        lte(inventoryAssets.acquiredAt, to),
      ))
      .orderBy(asc(inventoryAssets.assetTag)),
    db.select({
      id: assetMaintenance.id,
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
      .where(and(
        eq(assetMaintenance.schoolId, context.schoolId),
        gte(assetMaintenance.maintenanceDate, from),
        lte(assetMaintenance.maintenanceDate, to),
      ))
      .orderBy(desc(assetMaintenance.maintenanceDate), desc(assetMaintenance.id)),
  ]);
  const currency = school?.currency ?? "USD";
  const reportItems = items.filter((item) =>
    !searchTerm || `${item.sku} ${item.name} ${item.categoryName} ${item.supplierName ?? ""} ${item.locationName ?? ""}`
      .toLocaleLowerCase().includes(searchTerm)
  );
  const reportMovements = movements.filter((movement) =>
    (movementType === "all" || movement.movementType === movementType) &&
    (!searchTerm || `${movement.sku} ${movement.itemName} ${movement.categoryName} ${movement.reference ?? ""} ${movement.note ?? ""}`
      .toLocaleLowerCase().includes(searchTerm))
  );
  const reportAssets = assets.filter((asset) =>
    (assetStatus === "all" || asset.status === assetStatus) &&
    (!searchTerm || `${asset.assetTag} ${asset.name} ${asset.description ?? ""} ${asset.locationName ?? ""}`
      .toLocaleLowerCase().includes(searchTerm))
  );
  const reportMaintenance = maintenance.filter((record) =>
    !searchTerm || `${record.assetTag} ${record.assetName} ${record.description} ${record.performedBy ?? ""}`
      .toLocaleLowerCase().includes(searchTerm)
  );
  const lowStock = reportItems.filter((item) =>
    item.status === "active" && Number(item.quantityOnHand) <= Number(item.reorderLevel)
  );
  const totalRows = report === "stock"
    ? reportItems.length
    : report === "low-stock"
      ? lowStock.length
      : report === "movements"
        ? reportMovements.length
        : report === "assets"
          ? reportAssets.length
          : reportMaintenance.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(requestedPageNumber, pageCount);
  const start = (page - 1) * pageSize;
  const visibleItems = reportItems.slice(start, start + pageSize);
  const visibleLowStock = lowStock.slice(start, start + pageSize);
  const visibleMovements = reportMovements.slice(start, start + pageSize);
  const visibleAssets = reportAssets.slice(start, start + pageSize);
  const visibleMaintenance = reportMaintenance.slice(start, start + pageSize);
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams({ report, from, to });
    if (categoryId !== null) params.set("categoryId", String(categoryId));
    if (search) params.set("search", search);
    if (movementType !== "all") params.set("movementType", movementType);
    if (assetStatus !== "all") params.set("status", assetStatus);
    params.set("pageSize", String(pageSize));
    params.set("page", String(targetPage));
    return `/admin/inventory/reports?${params.toString()}`;
  };
  const stockValue = reportItems.reduce((total, item) =>
    total + Number(item.quantityOnHand) * Number(item.averageUnitCost), 0);
  const received = reportMovements.filter((movement) => movement.movementType === "received")
    .reduce((total, movement) => total + Number(movement.quantity), 0);
  const issued = reportMovements.filter((movement) => movement.movementType === "issued")
    .reduce((total, movement) => total + Number(movement.quantity), 0);
  const maintenanceCost = reportMaintenance.reduce((total, record) => total + Number(record.cost), 0);
  const hasDemoRows = reportItems.some((item) => item.name.startsWith("DEMO TEST ONLY - "))
    || reportAssets.some((asset) => asset.name.startsWith("DEMO TEST ONLY - "))
    || reportMovements.some((movement) => movement.itemName.startsWith("DEMO TEST ONLY - "))
    || reportMaintenance.some((record) => record.assetName.startsWith("DEMO TEST ONLY - "));
  const activeReport = reports.find((item) => item.id === report) ?? reports[0];
  const reportRows = report === "low-stock" ? lowStock : reportItems;
  const csv = report === "stock" || report === "low-stock"
    ? {
      headers: ["SKU", "Item", "Category", "Quantity on hand", "Unit", "Reorder level", "Average unit cost", "Stock value", "Supplier", "Location", "Status"],
      rows: reportRows.map((item) => [
        item.sku, item.name, item.categoryName, item.quantityOnHand, item.unit, item.reorderLevel,
        item.averageUnitCost, (Number(item.quantityOnHand) * Number(item.averageUnitCost)).toFixed(2),
        item.supplierName ?? "", item.locationName ?? "", item.status,
      ]),
    }
    : report === "movements"
      ? {
        headers: ["Date", "SKU", "Item", "Category", "Movement", "Quantity", "Balance after", "Unit cost", "Reference", "Note"],
        rows: reportMovements.map((movement) => [
          formatDate(movement.createdAt), movement.sku, movement.itemName, movement.categoryName,
          movement.movementType, movement.quantity, movement.quantityAfter, movement.unitCost,
          movement.reference ?? "", movement.note ?? "",
        ]),
      }
      : report === "assets"
        ? {
          headers: ["Asset tag", "Asset", "Acquired", "Acquisition cost", "Location", "Status", "Description"],
          rows: reportAssets.map((asset) => [
            asset.assetTag, asset.name, asset.acquiredAt, asset.acquisitionCost,
            asset.locationName ?? "", asset.status, asset.description ?? "",
          ]),
        }
        : {
          headers: ["Date", "Asset tag", "Asset", "Work performed", "Cost", "Provider"],
          rows: reportMaintenance.map((record) => [
            record.maintenanceDate, record.assetTag, record.assetName, record.description,
            record.cost, record.performedBy ?? "",
          ]),
        };

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 print:hidden">
        <div>
          <p className="text-sm font-semibold text-violet-700">Operations · Inventory module</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Reports</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Review current stock, stock movements, low stock, assets, and maintenance.</p>
        </div>
      </header>

      <InventoryModuleNav active="reports" permissions={context.grantedPermissions} />

      <div>
        <h2 className="text-lg font-bold text-slate-900">Inventory reports</h2>
        <p className="text-sm text-slate-500">Choose a stock or asset report.</p>
      </div>
      <nav aria-label="Inventory reports" className="flex flex-wrap gap-2 print:hidden">
        {reports.map((item) => (
          <Link key={item.id} href={`/admin/inventory/reports?report=${item.id}&from=${from}&to=${to}${categoryId ? `&categoryId=${categoryId}` : ""}`}
            aria-current={report === item.id ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${report === item.id ? "bg-violet-700 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            {item.label}
          </Link>
        ))}
      </nav>

      <SmartFilterForm method="get" className="print:hidden flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input type="hidden" name="report" value={report} />
        {(report === "stock" || report === "low-stock" || report === "movements" || report === "assets" || report === "maintenance") && (
          <label className="min-w-52 flex-1 text-sm font-medium text-slate-700">Search
            <input type="search" name="search" maxLength={120} defaultValue={search}
              placeholder={report === "movements" ? "Item, SKU, or reference" : report === "assets" ? "Asset name, tag, or location" : report === "maintenance" ? "Asset, work, or provider" : "Item name, SKU, or supplier"}
              className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3" />
          </label>
        )}
        {report !== "stock" && report !== "low-stock" && (
          <>
            <label className="text-sm text-slate-700">From<input name="from" type="date" defaultValue={from} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3" /></label>
            <label className="text-sm text-slate-700">To<input name="to" type="date" defaultValue={to} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3" /></label>
          </>
        )}
        {(report === "stock" || report === "low-stock" || report === "movements") && (
          <SearchableSelect label="Category" name="categoryId" defaultValue={categoryId ? String(categoryId) : ""}
            options={[{ value: "", label: "All categories" }, ...categories.map((category) => ({ value: String(category.id), label: category.name }))]}
            placeholder="Search categories..." />
        )}
        {report === "movements" && (
          <label className="text-sm text-slate-700">Movement type
            <select name="movementType" defaultValue={movementType} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-slate-50 px-3">
              <option value="all">All movement types</option><option value="received">Received</option>
              <option value="issued">Issued</option><option value="adjustment">Adjustment</option>
            </select>
          </label>
        )}
        {report === "assets" && (
          <label className="text-sm text-slate-700">Asset status
            <select name="status" defaultValue={assetStatus} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-slate-50 px-3">
              <option value="all">All statuses</option><option value="active">Active</option>
              <option value="maintenance">Under maintenance</option><option value="retired">Retired</option>
            </select>
          </label>
        )}
        <button className="h-10 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white">Update report</button>
        <Link href="/admin/inventory/reports" className="h-10 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
        <DownloadCsv
          headers={csv.headers}
          rows={csv.rows}
          fileName={`inventory-${report}${report === "stock" || report === "low-stock" ? "" : `-${from}-to-${to}`}.csv`}
        />
        <PrintReportButton />
      </SmartFilterForm>

      <section className="print-report-content space-y-5">
        <header className="print-report-heading">
          <p className="print-report-kicker">Operations · Inventory and assets</p>
          <h2>{activeReport.label} report</h2>
          <p>{report === "stock" || report === "low-stock" ? "Current stock position" : `${from} through ${to}`}
            {categoryId ? ` · ${categories.find((category) => category.id === categoryId)?.name ?? "Selected category"}` : " · All categories"}</p>
        </header>
        {hasDemoRows && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">DEMO TEST ONLY records are included in this report as workflow examples; they are not real stock or school property.</p>}

        {report === "stock" && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Items in register" value={String(reportItems.length)} />
              <Metric label="Low-stock items" value={String(lowStock.length)} />
              <Metric label="Stock on hand value" value={formatCurrency(stockValue, currency)} />
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
                  <th className="px-4 py-3">Item</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">On hand</th>
                  <th className="px-4 py-3">Reorder level</th><th className="px-4 py-3">Unit cost</th><th className="px-4 py-3">Stock value</th>
                  <th className="px-4 py-3">Supplier / location</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3"><strong>{item.name}</strong><span className="block text-xs text-slate-500">{item.sku} · {item.status}</span></td>
                    <td className="px-4 py-3">{item.categoryName}</td>
                    <td className="px-4 py-3 tabular-nums">{item.quantityOnHand} {item.unit}</td>
                    <td className="px-4 py-3 tabular-nums">{item.reorderLevel} {item.unit}</td>
                    <td className="px-4 py-3">{formatCurrency(item.averageUnitCost, currency)}</td>
                    <td className="px-4 py-3 font-semibold">{formatCurrency(Number(item.quantityOnHand) * Number(item.averageUnitCost), currency)}</td>
                    <td className="px-4 py-3">{item.supplierName ?? "—"}<span className="block text-xs text-slate-500">{item.locationName ?? "No location"}</span></td>
                  </tr>
                ))}{!reportItems.length && <EmptyRow columns={7} text="No stock items match this report." />}</tbody>
              </table>
            </div>
            <TablePagination ariaLabel="Stock report" currentPage={page} pageSize={pageSize} totalRows={reportItems.length} hrefForPage={pageHref} />
          </>
        )}

        {report === "low-stock" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">On hand</th><th className="px-4 py-3">Reorder level</th><th className="px-4 py-3">Supplier / location</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleLowStock.map((item) => (
                  <tr key={item.id}><td className="px-4 py-3"><strong>{item.name}</strong><span className="block text-xs text-slate-500">{item.sku}</span></td><td className="px-4 py-3">{item.categoryName}</td><td className="px-4 py-3 font-semibold">{item.quantityOnHand} {item.unit}</td><td className="px-4 py-3">{item.reorderLevel} {item.unit}</td><td className="px-4 py-3">{item.supplierName ?? "—"}<span className="block text-xs text-slate-500">{item.locationName ?? "No location"}</span></td></tr>
                ))}{!lowStock.length && <EmptyRow columns={5} text="No active items are at or below their reorder level." />}</tbody>
              </table>
            </div>
            <TablePagination ariaLabel="Low stock report" currentPage={page} pageSize={pageSize} totalRows={lowStock.length} hrefForPage={pageHref} />
          </div>
        )}

        {report === "movements" && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Stock received" value={received.toLocaleString()} />
              <Metric label="Stock issued" value={issued.toLocaleString()} />
              <Metric label="Movements" value={String(reportMovements.length)} />
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[750px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date / item</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Movement</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Balance after</th><th className="px-4 py-3">Reference / note</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-4 py-3">{formatDate(movement.createdAt)}<span className="block text-xs text-slate-500">{movement.itemName} · {movement.sku}</span></td>
                    <td className="px-4 py-3">{movement.categoryName}</td><td className="px-4 py-3 capitalize">{movement.movementType}</td>
                    <td className="px-4 py-3">{movement.quantity} {movement.unit}</td><td className="px-4 py-3">{movement.quantityAfter} {movement.unit}</td>
                    <td className="px-4 py-3">{movement.reference ?? "—"}<span className="block text-xs text-slate-500">{movement.note ?? ""}</span></td>
                  </tr>
                ))}{!reportMovements.length && <EmptyRow columns={6} text="No stock movements match these filters." />}</tbody>
              </table>
            </div>
            <TablePagination ariaLabel="Stock movement report" currentPage={page} pageSize={pageSize} totalRows={reportMovements.length} hrefForPage={pageHref} />
          </>
        )}

        {report === "assets" && (
          <>
            <Metric label="Assets acquired in period" value={String(reportAssets.length)} />
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Acquired</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleAssets.map((asset) => (
                  <tr key={asset.assetTag}><td className="px-4 py-3"><strong>{asset.name}</strong><span className="block text-xs text-slate-500">{asset.assetTag}</span></td><td className="px-4 py-3">{asset.acquiredAt}</td><td className="px-4 py-3">{formatCurrency(asset.acquisitionCost, currency)}</td><td className="px-4 py-3">{asset.locationName ?? "Unassigned"}</td><td className="px-4 py-3 capitalize">{asset.status}</td></tr>
                ))}{!reportAssets.length && <EmptyRow columns={5} text="No assets match this period and status." />}</tbody>
              </table>
            </div>
            <TablePagination ariaLabel="Asset report" currentPage={page} pageSize={pageSize} totalRows={reportAssets.length} hrefForPage={pageHref} />
          </>
        )}

        {report === "maintenance" && (
          <>
            <Metric label="Maintenance costs" value={formatCurrency(maintenanceCost, currency)} />
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date / asset</th><th className="px-4 py-3">Work performed</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Provider</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleMaintenance.map((record) => (
                  <tr key={record.id}><td className="px-4 py-3">{record.maintenanceDate}<span className="block text-xs text-slate-500">{record.assetTag} · {record.assetName}</span></td><td className="px-4 py-3">{record.description}</td><td className="px-4 py-3">{formatCurrency(record.cost, currency)}</td><td className="px-4 py-3">{record.performedBy ?? "—"}</td></tr>
                ))}{!reportMaintenance.length && <EmptyRow columns={4} text="No maintenance work matches this date range and search." />}</tbody>
              </table>
            </div>
            <TablePagination ariaLabel="Maintenance report" currentPage={page} pageSize={pageSize} totalRows={reportMaintenance.length} hrefForPage={pageHref} />
          </>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return <tr><td colSpan={columns} className="px-4 py-8 text-center text-sm text-slate-500">{text}</td></tr>;
}
