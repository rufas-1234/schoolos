"use client";

import { useActionState, type ReactNode } from "react";
import { AdminRecordDialog } from "@/components/admin-data-table";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";
import {
  createInventoryAsset,
  createInventoryCategory,
  createInventoryItem,
  createInventoryLocation,
  createInventorySupplier,
  recordAssetMaintenance,
  recordInventoryMovement,
  updateInventoryAsset,
  updateAssetMaintenance,
  updateInventoryCategory,
  updateInventoryItem,
  updateInventoryLocation,
  updateInventorySupplier,
  type InventoryActionState,
} from "./actions";

export type InventoryOption = { id: number; label: string };
type EditableLookup = { id: number; name: string; description: string | null };
type EditableSupplier = {
  id: number;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};
type EditableItem = {
  id: number;
  categoryId: number;
  supplierId: number | null;
  locationId: number | null;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorderLevel: string;
  status: string;
};
type EditableAsset = {
  id: number;
  itemId: number | null;
  locationId: number | null;
  assetTag: string;
  name: string;
  description: string | null;
  acquiredAt: string;
  acquisitionCost: string;
  status: string;
};
type EditableMaintenance = {
  id: number;
  assetId: number;
  assetLabel: string;
  maintenanceDate: string;
  description: string;
  cost: string;
  performedBy: string | null;
};

function ActionForm({
  action,
  title,
  children,
  submitLabel = "Save",
}: {
  action: (state: InventoryActionState, formData: FormData) => Promise<InventoryActionState>;
  title: string;
  children: ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children}
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">{state.message ?? "Saved successfully."}</p>}
      <button disabled={pending} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}

function TextField({
  label,
  name,
  required = true,
  type = "text",
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  defaultValue?: string | number | null;
}) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="mb-1 block font-medium">{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue ?? ""} placeholder={placeholder}
        step={type === "number" ? "any" : undefined}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3" />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  emptyLabel,
  required = true,
  defaultValue,
}: {
  label: string;
  name: string;
  options: InventoryOption[];
  emptyLabel?: string;
  required?: boolean;
  defaultValue?: number | null;
}) {
  const searchableOptions: SearchableSelectOption[] = [
    ...(!required ? [{ value: "", label: emptyLabel ?? "None" }] : []),
    ...options.map((option) => ({ value: String(option.id), label: option.label })),
  ];
  return <SearchableSelect
    label={label}
    name={name}
    options={searchableOptions}
    defaultValue={defaultValue === null || defaultValue === undefined ? "" : String(defaultValue)}
    placeholder={options.length ? "Search or choose..." : "No options available"}
    emptyLabel="No matching options."
    required={required}
  />;
}

function DescriptionField({ name = "description", defaultValue }: { name?: string; defaultValue?: string | null }) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="mb-1 block font-medium">Description</span>
      <textarea name={name} rows={2} defaultValue={defaultValue ?? ""} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
    </label>
  );
}

export function InventoryForms({
  section,
  categories,
  suppliers,
  locations,
  items,
  assets,
  categoryRecords,
  supplierRecords,
  locationRecords,
}: {
  section: "inventory" | "assets";
  categories: InventoryOption[];
  suppliers: InventoryOption[];
  locations: InventoryOption[];
  items: InventoryOption[];
  assets: InventoryOption[];
  categoryRecords: EditableLookup[];
  supplierRecords: EditableSupplier[];
  locationRecords: EditableLookup[];
}) {
  return (
    <div className="space-y-5">
      {section === "inventory" && <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Inventory setup</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ActionForm action={createInventoryCategory} title="Add category">
            <TextField label="Category name" name="name" />
            <DescriptionField />
          </ActionForm>
          <ActionForm action={createInventorySupplier} title="Add supplier">
            <TextField label="Supplier name" name="name" />
            <TextField label="Contact person" name="contactName" required={false} />
            <TextField label="Email" name="email" type="email" required={false} />
            <TextField label="Phone" name="phone" required={false} />
            <TextField label="Address" name="address" required={false} />
            <DescriptionField />
          </ActionForm>
          <ActionForm action={createInventoryLocation} title="Add stock location">
            <TextField label="Location name" name="name" placeholder="Store room" />
            <DescriptionField />
          </ActionForm>
          <ActionForm action={createInventoryItem} title="Register inventory item">
            <TextField label="SKU / item code" name="sku" />
            <TextField label="Item name" name="name" />
            <SelectField label="Category" name="categoryId" options={categories} />
            <SelectField label="Default supplier" name="supplierId" options={suppliers} emptyLabel="No supplier" required={false} />
            <SelectField label="Storage location" name="locationId" options={locations} emptyLabel="Unassigned" required={false} />
            <TextField label="Unit" name="unit" placeholder="piece, box, litre..." />
            <TextField label="Low-stock threshold" name="reorderLevel" type="number" />
            <DescriptionField />
          </ActionForm>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-900">Manage categories, suppliers, and locations</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categoryRecords.map((record) => (
              <LookupRecordEditor key={`category-${record.id}`} title="Edit category" recordId={record.id}
                name={record.name} description={record.description} action={updateInventoryCategory} />
            ))}
            {supplierRecords.map((record) => (
              <SupplierRecordEditor key={`supplier-${record.id}`} record={record} />
            ))}
            {locationRecords.map((record) => (
              <LookupRecordEditor key={`location-${record.id}`} title="Edit location" recordId={record.id}
                name={record.name} description={record.description} action={updateInventoryLocation} />
            ))}
            {!categoryRecords.length && !supplierRecords.length && !locationRecords.length && (
              <p className="text-sm text-slate-500">Add a category, supplier, or location to manage it here.</p>
            )}
          </div>
        </div>
      </section>}

      {section === "inventory" && <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Stock movement</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ActionForm action={recordInventoryMovement} title="Receive, issue, or adjust stock">
            <SelectField label="Item" name="itemId" options={items} />
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block font-medium">Movement type</span>
              <select name="movementType" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
                <option value="received">Stock received</option>
                <option value="issued">Stock issued</option>
                <option value="adjustment">Stock adjustment (use +/- quantity)</option>
              </select>
            </label>
            <TextField label="Quantity" name="quantity" type="number" placeholder="e.g. 12.5 or -2 for adjustment" />
            <SelectField label="Supplier (required for receipt)" name="supplierId" options={suppliers} emptyLabel="Select supplier" required={false} />
            <SelectField label="Location" name="locationId" options={locations} emptyLabel="Keep current location" required={false} />
            <TextField label="Unit cost (receipts only)" name="unitCost" type="number" required={false} />
            <TextField label="Reference" name="reference" required={false} />
            <TextField label="Note" name="note" required={false} />
          </ActionForm>
        </div>
      </section>}

      {section === "assets" && <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Assets and maintenance</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ActionForm action={createInventoryAsset} title="Register school asset">
            <TextField label="Asset tag" name="assetTag" />
            <TextField label="Asset name" name="name" />
            <SelectField label="Related inventory item" name="itemId" options={items} emptyLabel="Not linked" required={false} />
            <SelectField label="Current location" name="locationId" options={locations} emptyLabel="Unassigned" required={false} />
            <TextField label="Acquisition date" name="acquiredAt" type="date" />
            <TextField label="Acquisition cost" name="acquisitionCost" type="number" />
            <DescriptionField />
          </ActionForm>
          <ActionForm action={recordAssetMaintenance} title="Log asset maintenance">
            <SelectField label="Asset" name="assetId" options={assets} />
            <TextField label="Maintenance date" name="maintenanceDate" type="date" />
            <TextField label="Work performed" name="description" />
            <TextField label="Cost" name="cost" type="number" required={false} />
            <TextField label="Performed by" name="performedBy" required={false} />
          </ActionForm>
        </div>
      </section>}
    </div>
  );
}

function LookupRecordEditor({
  title,
  recordId,
  name,
  description,
  action,
}: {
  title: string;
  recordId: number;
  name: string;
  description: string | null;
  action: (state: InventoryActionState, formData: FormData) => Promise<InventoryActionState>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
      <span className="min-w-0 truncate text-sm text-slate-700">{name}</span>
      <AdminRecordDialog title={`${title}: ${name}`}>
        <ActionForm action={action} title={title} submitLabel="Save changes">
          <input type="hidden" name="recordId" value={recordId} />
          <TextField label="Name" name="name" defaultValue={name} />
          <DescriptionField defaultValue={description} />
        </ActionForm>
      </AdminRecordDialog>
    </div>
  );
}

function SupplierRecordEditor({ record }: { record: EditableSupplier }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
      <span className="min-w-0 truncate text-sm text-slate-700">{record.name}</span>
      <AdminRecordDialog title={`Edit supplier: ${record.name}`}>
        <ActionForm action={updateInventorySupplier} title="Edit supplier" submitLabel="Save changes">
          <input type="hidden" name="recordId" value={record.id} />
          <TextField label="Supplier name" name="name" defaultValue={record.name} />
          <TextField label="Contact person" name="contactName" required={false} defaultValue={record.contactName} />
          <TextField label="Email" name="email" type="email" required={false} defaultValue={record.email} />
          <TextField label="Phone" name="phone" required={false} defaultValue={record.phone} />
          <TextField label="Address" name="address" required={false} defaultValue={record.address} />
        </ActionForm>
      </AdminRecordDialog>
    </div>
  );
}

export function InventoryItemEditor({
  item,
  categories,
  suppliers,
  locations,
}: {
  item: EditableItem;
  categories: InventoryOption[];
  suppliers: InventoryOption[];
  locations: InventoryOption[];
}) {
  return (
    <AdminRecordDialog title={`Edit inventory item: ${item.name}`}>
      <ActionForm action={updateInventoryItem} title="Edit inventory item" submitLabel="Save changes">
        <input type="hidden" name="itemId" value={item.id} />
        <TextField label="SKU / item code" name="sku" defaultValue={item.sku} />
        <TextField label="Item name" name="name" defaultValue={item.name} />
        <SelectField label="Category" name="categoryId" options={categories} defaultValue={item.categoryId} />
        <SelectField label="Default supplier" name="supplierId" options={suppliers} emptyLabel="No supplier" required={false} defaultValue={item.supplierId} />
        <SelectField label="Storage location" name="locationId" options={locations} emptyLabel="Unassigned" required={false} defaultValue={item.locationId} />
        <TextField label="Unit" name="unit" defaultValue={item.unit} />
        <TextField label="Low-stock threshold" name="reorderLevel" type="number" defaultValue={item.reorderLevel} />
        <DescriptionField defaultValue={item.description} />
        <label className="block text-sm text-slate-700">
          <span className="mb-1 block font-medium">Status</span>
          <select name="status" defaultValue={item.status} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
            <option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </label>
      </ActionForm>
    </AdminRecordDialog>
  );
}

export function InventoryAssetEditor({
  asset,
  items,
  locations,
}: {
  asset: EditableAsset;
  items: InventoryOption[];
  locations: InventoryOption[];
}) {
  return (
    <AdminRecordDialog title={`Edit asset: ${asset.name}`}>
      <ActionForm action={updateInventoryAsset} title="Edit school asset" submitLabel="Save changes">
        <input type="hidden" name="assetId" value={asset.id} />
        <TextField label="Asset tag" name="assetTag" defaultValue={asset.assetTag} />
        <TextField label="Asset name" name="name" defaultValue={asset.name} />
        <SelectField label="Related inventory item" name="itemId" options={items} emptyLabel="Not linked" required={false} defaultValue={asset.itemId} />
        <SelectField label="Current location" name="locationId" options={locations} emptyLabel="Unassigned" required={false} defaultValue={asset.locationId} />
        <TextField label="Acquisition date" name="acquiredAt" type="date" defaultValue={asset.acquiredAt} />
        <TextField label="Acquisition cost" name="acquisitionCost" type="number" defaultValue={asset.acquisitionCost} />
        <DescriptionField defaultValue={asset.description} />
        <label className="block text-sm text-slate-700">
          <span className="mb-1 block font-medium">Status</span>
          <select name="status" defaultValue={asset.status} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
            <option value="active">Active</option><option value="maintenance">Under maintenance</option><option value="retired">Retired</option>
          </select>
        </label>
      </ActionForm>
    </AdminRecordDialog>
  );
}

export function AssetMaintenanceEditor({
  record,
  assets,
}: {
  record: EditableMaintenance;
  assets: InventoryOption[];
}) {
  return (
    <AdminRecordDialog title={`Edit maintenance: ${record.assetLabel}`}>
      <ActionForm action={updateAssetMaintenance} title="Edit maintenance record" submitLabel="Save changes">
        <input type="hidden" name="maintenanceId" value={record.id} />
        <SelectField label="Asset" name="assetId" options={assets} defaultValue={record.assetId} />
        <TextField label="Maintenance date" name="maintenanceDate" type="date" defaultValue={record.maintenanceDate} />
        <TextField label="Work performed" name="description" defaultValue={record.description} />
        <TextField label="Cost" name="cost" type="number" defaultValue={record.cost} />
        <TextField label="Performed by" name="performedBy" required={false} defaultValue={record.performedBy} />
      </ActionForm>
    </AdminRecordDialog>
  );
}
