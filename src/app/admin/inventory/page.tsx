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
import { resolveInventoryView } from "@/lib/inventory-policy";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";
import {
  AssetMaintenanceEditor,
  InventoryAssetEditor,
  InventoryDeleteForm,
  InventoryForms,
  InventoryItemEditor,
  InventoryRecordView,
  type InventoryOption,
} from "./inventory-forms";
import { InventoryModuleNav } from "./module-nav";
import { TablePagination } from "@/components/table-pagination";
import { parsePageSize } from "@/components/pagination-utils";

export const dynamic = "force-dynamic";
function formatCurrency(value: string | number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value));
}

function formatDate(value: Date | string): string {
  return value instanceof Date ? value.toLocaleString() : value;
}

type SearchParams = {
  section?: string | string[];
  view?: string | string[];
  search?: string | string[];
  categoryId?: string | string[];
  supplierId?: string | string[];
  locationId?: string | string[];
  status?: string | string[];
  movementType?: string | string[];
  itemPage?: string | string[];
  lowStockPage?: string | string[];
  assetPage?: string | string[];
  movementPage?: string | string[];
  maintenancePage?: string | string[];
  pageSize?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestedPage(value: string | undefined): number {
  return value && /^\d+$/.test(value) ? Math.max(1, Number(value)) : 1;
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await requireSchoolPermission("inventory.manage");
  const query = await searchParams;
  const pageSize = parsePageSize(query.pageSize);
  const requestedSection = first(query.section);
  const requestedView = first(query.view);
  const section = resolveInventoryView(requestedView, requestedSection);
  const search = first(query.search)?.trim().slice(0, 120) ?? "";
  const selectedCategory = first(query.categoryId) ?? "";
  const selectedSupplier = first(query.supplierId) ?? "";
  const selectedLocation = first(query.locationId) ?? "";
  const requestedMovementType = first(query.movementType);
  const movementType = requestedMovementType === "received" || requestedMovementType === "issued" ||
    requestedMovementType === "adjustment" ? requestedMovementType : "all";
  const requestedItemPage = requestedPage(first(query.itemPage));
  const requestedLowStockPage = requestedPage(first(query.lowStockPage));
  const requestedAssetPage = requestedPage(first(query.assetPage));
  const requestedMovementPage = requestedPage(first(query.movementPage));
  const requestedMaintenancePage = requestedPage(first(query.maintenancePage));
  const requestedStatus = first(query.status);
  const assetStatus = requestedStatus === "maintenance" || requestedStatus === "retired"
    ? requestedStatus
    : requestedStatus === "active"
      ? "active"
      : "all";
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
      categoryId: inventoryItems.categoryId,
      supplierId: inventoryItems.supplierId,
      locationId: inventoryItems.locationId,
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
      .orderBy(asc(inventoryItems.name), asc(inventoryItems.id)),
    db.select({
      id: inventoryAssets.id,
      itemId: inventoryAssets.itemId,
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
      id: inventoryMovements.id,
      itemName: inventoryItems.name,
      sku: inventoryItems.sku,
      unit: inventoryItems.unit,
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
      .where(eq(inventoryMovements.schoolId, context.schoolId))
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id)),
    db.select({
      id: assetMaintenance.id,
      assetId: assetMaintenance.assetId,
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
      .orderBy(desc(assetMaintenance.maintenanceDate), desc(assetMaintenance.id)),
  ]);
  const options = <T extends { id: number }>(rows: T[], label: (row: T) => string): InventoryOption[] =>
    rows.map((row) => ({ id: row.id, label: label(row) }));
  const categoryOptions = options(categories, (row) => row.name);
  const supplierOptions = options(suppliers, (row) => row.name);
  const locationOptions = options(locations, (row) => row.name);
  const itemOptions = options(items.filter((item) => item.status === "active"), (row) => `${row.sku} · ${row.name}`);
  const allAssetOptions = options(assets, (row) => `${row.assetTag} · ${row.name}`);
  const assetOptions = options(assets.filter((asset) => asset.status !== "retired"), (row) => `${row.assetTag} · ${row.name}`);
  const stockValue = items.reduce((total, item) =>
    total + Number(item.quantityOnHand) * Number(item.averageUnitCost), 0);
  const assetValue = assets.reduce((total, asset) => total + Number(asset.acquisitionCost), 0);
  const normalizedSearch = search.toLocaleLowerCase();
  const filteredItems = items.filter((item) =>
    (!normalizedSearch || `${item.name} ${item.sku} ${item.categoryName} ${item.supplierName ?? ""} ${item.locationName ?? ""}`
      .toLocaleLowerCase().includes(normalizedSearch)) &&
    (!selectedCategory || String(categories.find((category) => category.name === item.categoryName)?.id) === selectedCategory) &&
    (!selectedSupplier || String(suppliers.find((supplier) => supplier.name === item.supplierName)?.id) === selectedSupplier) &&
    (!selectedLocation || String(locations.find((location) => location.name === item.locationName)?.id) === selectedLocation)
  );
  const filteredAssets = assets.filter((asset) =>
    (!normalizedSearch || `${asset.name} ${asset.assetTag} ${asset.description ?? ""} ${asset.locationName ?? ""}`
      .toLocaleLowerCase().includes(normalizedSearch)) &&
    (!selectedLocation || String(locations.find((location) => location.name === asset.locationName)?.id) === selectedLocation) &&
    (assetStatus === "all" || asset.status === assetStatus)
  );
  const itemPageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const itemPage = Math.min(requestedItemPage, itemPageCount);
  const visibleItems = filteredItems.slice((itemPage - 1) * pageSize, itemPage * pageSize);
  const assetPageCount = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const assetPage = Math.min(requestedAssetPage, assetPageCount);
  const visibleAssets = filteredAssets.slice((assetPage - 1) * pageSize, assetPage * pageSize);
  const filteredMovements = movements.filter((movement) =>
    (!normalizedSearch || `${movement.itemName} ${movement.sku} ${movement.movementType} ${movement.reference ?? ""} ${movement.note ?? ""}`
      .toLocaleLowerCase().includes(normalizedSearch)) &&
    (movementType === "all" || movement.movementType === movementType)
  );
  const movementPageCount = Math.max(1, Math.ceil(filteredMovements.length / pageSize));
  const movementPage = Math.min(requestedMovementPage, movementPageCount);
  const visibleMovements = filteredMovements.slice((movementPage - 1) * pageSize, movementPage * pageSize);
  const filteredMaintenance = maintenance.filter((record) =>
    !normalizedSearch || `${record.assetTag} ${record.assetName} ${record.description} ${record.performedBy ?? ""}`
      .toLocaleLowerCase().includes(normalizedSearch)
  );
  const maintenancePageCount = Math.max(1, Math.ceil(filteredMaintenance.length / pageSize));
  const maintenancePage = Math.min(requestedMaintenancePage, maintenancePageCount);
  const visibleMaintenance = filteredMaintenance.slice((maintenancePage - 1) * pageSize, maintenancePage * pageSize);
  const pageHref = (parameter: string, page: number) => {
    const params = new URLSearchParams({ view: section });
    if (search) params.set("search", search);
    if (selectedCategory) params.set("categoryId", selectedCategory);
    if (selectedSupplier) params.set("supplierId", selectedSupplier);
    if (selectedLocation) params.set("locationId", selectedLocation);
    if (assetStatus !== "all") params.set("status", assetStatus);
    if (movementType !== "all") params.set("movementType", movementType);
    params.set("pageSize", String(pageSize));
    params.set(parameter, String(page));
    return `/admin/inventory?${params.toString()}`;
  };
  const lowStock = filteredItems.filter((item) =>
    item.status === "active" && Number(item.quantityOnHand) <= Number(item.reorderLevel)
  );
  const lowStockPageCount = Math.max(1, Math.ceil(lowStock.length / pageSize));
  const lowStockPage = Math.min(requestedLowStockPage, lowStockPageCount);
  const visibleLowStock = lowStock.slice((lowStockPage - 1) * pageSize, lowStockPage * pageSize);
  const hasDemoRows = items.some((item) => item.name.startsWith("DEMO TEST ONLY - "))
    || assets.some((asset) => asset.name.startsWith("DEMO TEST ONLY - "));
  const currency = school?.currency ?? "USD";

  return (
    <main className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-violet-700">Operations · Inventory module</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">{{
          setup: "Inventory setup",
          register: "Stock register",
          movements: "Stock movement",
          assets: "School assets",
          maintenance: "Asset maintenance",
        }[section]}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          {{
            setup: "Create and maintain categories, suppliers, locations, and stock items.",
            register: "Review current quantities, costs, and reorder levels for each stock item.",
            movements: "Record stock receipts, issues, or adjustments and review movement history.",
            assets: "Register school property, track locations and lifecycle status, and keep maintenance records together.",
            maintenance: "Record and search maintenance performed on registered school assets.",
          }[section]}
        </p>
      </header>
      <InventoryModuleNav active={section} permissions={context.grantedPermissions} />
      {hasDemoRows && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Demo items are examples, not real school stock or assets.</p>}

      {section !== "assets" && section !== "maintenance" ? (
        <section aria-label="Inventory overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active items" value={String(items.filter((item) => item.status === "active").length)} />
          <Metric label="Low stock" value={String(lowStock.length)} tone={lowStock.length ? "amber" : "normal"} />
          <Metric label="Stock on hand value" value={formatCurrency(stockValue, currency)} />
          <Metric label="Categories" value={String(categories.length)} />
        </section>
      ) : (
        <section aria-label="Asset overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Registered assets" value={String(assets.length)} />
          <Metric label="Active assets" value={String(assets.filter((asset) => asset.status === "active").length)} />
          <Metric label="Acquisition value" value={formatCurrency(assetValue, currency)} />
          <Metric label="Maintenance records" value={String(maintenance.length)} />
        </section>
      )}

      {section === "register" && lowStock.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-950">Low-stock notification</h2>
          <p className="mt-1 text-sm text-amber-900">Items at or below their configured reorder level need attention.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {visibleLowStock.map((item) => (
              <li key={item.id} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-950">
                <strong>{item.name}</strong> · {item.quantityOnHand} {item.unit} remaining (reorder at {item.reorderLevel})
              </li>
            ))}
          </ul>
          <TablePagination ariaLabel="Low-stock notifications" currentPage={lowStockPage} pageSize={pageSize} totalRows={lowStock.length}
            hrefForPage={(page) => pageHref("lowStockPage", page)} />
        </section>
      )}

      <SmartFilterForm method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="view" value={section} />
        <label className="min-w-52 flex-1 text-sm font-medium text-slate-700">Quick search {{
          setup: "setup records",
          register: "stock items",
          movements: "stock movements",
          assets: "assets",
          maintenance: "maintenance records",
        }[section]}
          <input type="search" name="search" maxLength={120} defaultValue={search}
          placeholder={{
            setup: "Category, supplier, or location...",
            register: "Item name, SKU, category, or supplier...",
            movements: "Item, SKU, movement, reference, or note...",
            assets: "Asset name, tag, or location...",
            maintenance: "Asset tag, asset name, work, or provider...",
          }[section]}
            className="mt-1.5 block h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3" />
        <span className="mt-1 block text-xs font-normal text-slate-500">Search updates as you type.</span>
        </label>
        {section === "register" ? (
          <>
            <SearchableSelect label="Category" name="categoryId" defaultValue={selectedCategory}
              options={[{ value: "", label: "All categories" }, ...categories.map((category) => ({ value: String(category.id), label: category.name }))]}
              placeholder="Search categories..." />
            <SearchableSelect label="Supplier" name="supplierId" defaultValue={selectedSupplier}
              options={[{ value: "", label: "All suppliers" }, ...suppliers.map((supplier) => ({ value: String(supplier.id), label: supplier.name }))]}
              placeholder="Search suppliers..." />
          </>
        ) : section === "assets" ? (
          <label className="text-sm font-medium text-slate-700">Asset status
            <select name="status" defaultValue={assetStatus} className="mt-1.5 block h-10 rounded-xl border border-slate-200 bg-slate-50 px-3">
              <option value="all">All statuses</option><option value="active">Active</option>
              <option value="maintenance">Under maintenance</option><option value="retired">Retired</option>
            </select>
          </label>
        ) : section === "movements" ? (
          <label className="text-sm font-medium text-slate-700">Movement type
            <select name="movementType" defaultValue={movementType} className="mt-1.5 block h-10 rounded-xl border border-slate-200 bg-slate-50 px-3">
              <option value="all">All movement types</option><option value="received">Received</option>
              <option value="issued">Issued</option><option value="adjustment">Adjustment</option>
            </select>
          </label>
        ) : null}
        {(section === "register" || section === "assets") && <SearchableSelect label="Location" name="locationId" defaultValue={selectedLocation}
          options={[{ value: "", label: "All locations" }, ...locations.map((location) => ({ value: String(location.id), label: location.name }))]}
          placeholder="Search locations..." />}
        <div className="flex items-center gap-2">
          <button className="h-10 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800">Apply filters</button>
          <a href={`/admin/inventory?view=${section}`} className="h-10 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</a>
        </div>
      </SmartFilterForm>

      {(section === "setup" || section === "movements" || section === "assets" || section === "maintenance") && (
        <InventoryForms section={section} categories={categoryOptions} suppliers={supplierOptions} locations={locationOptions} items={itemOptions} assets={assetOptions}
          categoryRecords={categories.filter((record) => !normalizedSearch || `${record.name} ${record.description ?? ""}`.toLocaleLowerCase().includes(normalizedSearch))}
          supplierRecords={suppliers.filter((record) => !normalizedSearch || `${record.name} ${record.contactName ?? ""} ${record.email ?? ""} ${record.phone ?? ""}`.toLocaleLowerCase().includes(normalizedSearch))}
          locationRecords={locations.filter((record) => !normalizedSearch || `${record.name} ${record.description ?? ""}`.toLocaleLowerCase().includes(normalizedSearch))} />
      )}

      {section === "register" && <>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold text-slate-900">Stock register</h2>
          <p className="mt-1 text-sm text-slate-500">Current quantities and average acquisition cost by item.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
              <th className="px-4 py-3">Item</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">On hand</th>
              <th className="px-4 py-3">Reorder level</th><th className="px-4 py-3">Avg. unit cost</th><th className="px-4 py-3">Supplier / location</th><th className="px-4 py-3">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleItems.map((item) => (
                <tr key={item.id} className={Number(item.quantityOnHand) <= Number(item.reorderLevel) ? "bg-amber-50/60" : ""}>
                  <td className="px-4 py-3"><strong>{item.name}</strong><span className="block text-xs text-slate-500">{item.sku} · {item.status}</span></td>
                  <td className="px-4 py-3">{item.categoryName}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{item.quantityOnHand} {item.unit}</td>
                  <td className="px-4 py-3 tabular-nums">{item.reorderLevel}</td>
                  <td className="px-4 py-3">{formatCurrency(item.averageUnitCost, currency)}</td>
                  <td className="px-4 py-3">{item.supplierName ?? "—"}<span className="block text-xs text-slate-500">{item.locationName ?? "No location"}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <InventoryRecordView title={`Inventory item: ${item.name}`} fields={[
                        { label: "Item", value: item.name },
                        { label: "SKU", value: item.sku },
                        { label: "Description", value: item.description },
                        { label: "Category", value: item.categoryName },
                        { label: "Quantity on hand", value: `${item.quantityOnHand} ${item.unit}` },
                        { label: "Reorder level", value: `${item.reorderLevel} ${item.unit}` },
                        { label: "Average unit cost", value: formatCurrency(item.averageUnitCost, currency) },
                        { label: "Supplier", value: item.supplierName },
                        { label: "Location", value: item.locationName },
                        { label: "Status", value: item.status },
                      ]} />
                      <InventoryItemEditor item={item} categories={categoryOptions} suppliers={supplierOptions} locations={locationOptions} />
                      <InventoryDeleteForm recordId={item.id} recordType="item" label={`Delete ${item.name}`} />
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredItems.length && <EmptyRow columns={7} text={items.length ? "No items match these filters." : "No inventory items have been registered."} />}
            </tbody>
          </table>
        </div>
        <TablePagination ariaLabel="Inventory items" currentPage={itemPage} pageSize={pageSize} totalRows={filteredItems.length}
          hrefForPage={(page) => pageHref("itemPage", page)} />
        </section>
      </>}

      {section === "assets" && <>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold text-slate-900">School asset register</h2>
          <p className="mt-1 text-sm text-slate-500">Record asset movements, lifecycle status, and maintenance history.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
              <th className="px-4 py-3">Asset</th><th className="px-4 py-3">Acquired</th><th className="px-4 py-3">Cost</th>
              <th className="px-4 py-3">Location &amp; status</th><th className="px-4 py-3">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleAssets.map((asset) => (
                <tr key={asset.id}>
                  <td className="px-4 py-3"><strong>{asset.name}</strong><span className="block text-xs text-slate-500">{asset.assetTag}</span></td>
                  <td className="px-4 py-3">{asset.acquiredAt}</td>
                  <td className="px-4 py-3">{formatCurrency(asset.acquisitionCost, currency)}</td>
                  <td className="px-4 py-3">{asset.locationName ?? "Unassigned"}<span className="block text-xs capitalize text-slate-500">{asset.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <InventoryRecordView title={`Asset: ${asset.name}`} fields={[
                        { label: "Asset", value: asset.name },
                        { label: "Asset tag", value: asset.assetTag },
                        { label: "Description", value: asset.description },
                        { label: "Related item", value: items.find((item) => item.id === asset.itemId)?.name },
                        { label: "Acquired", value: asset.acquiredAt },
                        { label: "Acquisition cost", value: formatCurrency(asset.acquisitionCost, currency) },
                        { label: "Location", value: asset.locationName },
                        { label: "Status", value: asset.status },
                      ]} />
                      <InventoryAssetEditor asset={asset} items={itemOptions} locations={locationOptions} />
                      <InventoryDeleteForm recordId={asset.id} recordType="asset" label={`Delete ${asset.name}`} />
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredAssets.length && <EmptyRow columns={5} text={assets.length ? "No assets match these filters." : "No school assets have been registered."} />}
            </tbody>
          </table>
        </div>
        <TablePagination ariaLabel="School assets" currentPage={assetPage} pageSize={pageSize} totalRows={filteredAssets.length}
          hrefForPage={(page) => pageHref("assetPage", page)} />
        </section>
      </>}

      {section === "movements" && <>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5"><h2 className="text-lg font-bold text-slate-900">Stock movements</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date / item</th><th className="px-4 py-3">Movement</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleMovements.map((movement) => (
                <tr key={movement.id}>
                  <td className="px-4 py-3">{formatDate(movement.createdAt)}<span className="block text-xs text-slate-500">{movement.itemName} · {movement.sku}</span></td>
                  <td className="px-4 py-3 capitalize">{movement.movementType}</td>
                  <td className="px-4 py-3 tabular-nums">{movement.quantity} {movement.unit}</td>
                  <td className="px-4 py-3 tabular-nums">{movement.quantityAfter} {movement.unit}</td>
                  <td className="px-4 py-3">
                    <InventoryRecordView title={`Stock movement: ${movement.itemName}`} fields={[
                      { label: "Date", value: formatDate(movement.createdAt) },
                      { label: "Item", value: `${movement.itemName} · ${movement.sku}` },
                      { label: "Movement type", value: movement.movementType },
                      { label: "Quantity", value: `${movement.quantity} ${movement.unit}` },
                      { label: "Balance before", value: `${movement.quantityBefore} ${movement.unit}` },
                      { label: "Balance after", value: `${movement.quantityAfter} ${movement.unit}` },
                      { label: "Unit cost", value: formatCurrency(movement.unitCost, currency) },
                      { label: "Reference", value: movement.reference },
                      { label: "Note", value: movement.note },
                    ]} />
                  </td>
                </tr>
              ))}
              {!filteredMovements.length && <EmptyRow columns={5} text={movements.length ? "No movements match these filters." : "No stock movements have been recorded."} />}
            </tbody>
          </table>
        </div>
        <TablePagination ariaLabel="Stock movements" currentPage={movementPage} pageSize={pageSize} totalRows={filteredMovements.length}
          hrefForPage={(page) => pageHref("movementPage", page)} />
        </section>
      </>}

      {section === "maintenance" && <>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5"><h2 className="text-lg font-bold text-slate-900">Asset maintenance log</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date / asset</th><th className="px-4 py-3">Work performed</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleMaintenance.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3">{record.maintenanceDate}<span className="block text-xs text-slate-500">{record.assetTag} · {record.assetName}</span></td>
                  <td className="px-4 py-3">{record.description}</td>
                  <td className="px-4 py-3">{formatCurrency(record.cost, currency)}</td>
                  <td className="px-4 py-3">{record.performedBy ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <InventoryRecordView title={`Maintenance: ${record.assetTag} · ${record.assetName}`} fields={[
                        { label: "Date", value: record.maintenanceDate },
                        { label: "Asset", value: `${record.assetTag} · ${record.assetName}` },
                        { label: "Work performed", value: record.description },
                        { label: "Cost", value: formatCurrency(record.cost, currency) },
                        { label: "Provider", value: record.performedBy },
                      ]} />
                      <AssetMaintenanceEditor record={{ ...record, assetLabel: `${record.assetTag} · ${record.assetName}` }} assets={allAssetOptions} />
                      <InventoryDeleteForm recordId={record.id} recordType="maintenance" label={`Delete maintenance record for ${record.assetTag}`} />
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredMaintenance.length && <EmptyRow columns={5} text={maintenance.length ? "No maintenance records match this search." : "No maintenance has been logged."} />}
            </tbody>
          </table>
        </div>
        <TablePagination ariaLabel="Asset maintenance records" currentPage={maintenancePage} pageSize={pageSize} totalRows={filteredMaintenance.length}
          hrefForPage={(page) => pageHref("maintenancePage", page)} />
        </section>
      </>}

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
