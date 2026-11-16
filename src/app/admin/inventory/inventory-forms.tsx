"use client";

import { useActionState, type ReactNode } from "react";
import {
  createInventoryAsset,
  createInventoryCategory,
  createInventoryItem,
  createInventoryLocation,
  createInventorySupplier,
  recordAssetMaintenance,
  recordInventoryMovement,
  updateInventoryAsset,
  type InventoryActionState,
} from "./actions";

export type InventoryOption = { id: number; label: string };

function ActionForm({
  action,
  title,
  children,
}: {
  action: (state: InventoryActionState, formData: FormData) => Promise<InventoryActionState>;
  title: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children}
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">{state.message ?? "Saved successfully."}</p>}
      <button disabled={pending} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Saving..." : "Save"}
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
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="mb-1 block font-medium">{label}</span>
      <input name={name} type={type} required={required} placeholder={placeholder}
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
}: {
  label: string;
  name: string;
  options: InventoryOption[];
  emptyLabel?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="mb-1 block font-medium">{label}</span>
      <select name={name} required={required} defaultValue=""
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
        <option value="">{emptyLabel ?? "Choose..."}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

function DescriptionField({ name = "description" }: { name?: string }) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="mb-1 block font-medium">Description</span>
      <textarea name={name} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
    </label>
  );
}

export function InventoryForms({
  categories,
  suppliers,
  locations,
  items,
  assets,
}: {
  categories: InventoryOption[];
  suppliers: InventoryOption[];
  locations: InventoryOption[];
  items: InventoryOption[];
  assets: InventoryOption[];
}) {
  return (
    <div className="space-y-5">
      <section>
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
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Stock and assets</h2>
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
      </section>
    </div>
  );
}

export function AssetLocationForm({
  assetId,
  locations,
  currentLocationId,
  currentStatus,
}: {
  assetId: number;
  locations: InventoryOption[];
  currentLocationId: number | null;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState(updateInventoryAsset, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="assetId" value={assetId} />
      <label className="text-xs text-slate-600">Location
        <select name="locationId" defaultValue={currentLocationId ?? ""} className="mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2">
          <option value="">Unassigned</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-600">Status
        <select name="status" defaultValue={currentStatus} className="mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2">
          <option value="active">Active</option>
          <option value="maintenance">Under maintenance</option>
          <option value="retired">Retired</option>
        </select>
      </label>
      <button disabled={pending} className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium disabled:opacity-50">
        {pending ? "Saving..." : "Update"}
      </button>
      {state.error && <span role="alert" className="text-xs text-rose-700">{state.error}</span>}
      {state.success && <span role="status" className="text-xs text-emerald-700">Updated.</span>}
    </form>
  );
}
