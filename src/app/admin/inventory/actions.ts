"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  assetMaintenance,
  auditLogs,
  inventoryAssets,
  inventoryCategories,
  inventoryItems,
  inventoryLocations,
  inventoryMovements,
  inventorySuppliers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  applyStockMovement,
  formatCostMinorUnits,
  formatQuantityMilliUnits,
  parseCostMinorUnits,
  parseQuantityMilliUnits,
  parseSignedQuantityMilliUnits,
  type StockMovementKind,
} from "@/lib/inventory-policy";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";

export type InventoryActionState = { error?: string; success?: boolean; message?: string };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const nameField = z.string().trim().min(1).max(160);
const optionalText = z.string().trim().max(1000).transform((value) => value || null);

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

async function writeAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  schoolId: number,
  actorUserId: string,
  action: string,
  resourceType: string,
  resourcePublicId: string,
  changedFields: string[],
) {
  await tx.insert(auditLogs).values({ schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields });
}

function revalidateInventory() {
  revalidatePath("/admin/inventory");
}

async function createLookupRecord(
  formData: FormData,
  kind: "category" | "supplier" | "location",
): Promise<InventoryActionState> {
  const context = await requireSchoolPermission("inventory.manage");
  const name = nameField.safeParse(value(formData, "name"));
  const description = optionalText.safeParse(value(formData, "description"));
  if (!name.success || !description.success) return { error: "Enter a valid name and description." };
  const publicId = randomUUID();
  const row = { publicId, schoolId: context.schoolId, name: name.data, description: description.data };
  let supplierValues: {
    contactName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null = null;
  if (kind === "supplier") {
    const contactName = optionalText.safeParse(value(formData, "contactName"));
    const email = z.union([z.literal(""), z.string().trim().email().max(320)]).safeParse(value(formData, "email"));
    const phone = z.string().trim().max(40).safeParse(value(formData, "phone"));
    const address = optionalText.safeParse(value(formData, "address"));
    if (!contactName.success || !email.success || !phone.success || !address.success) {
      return { error: "Enter valid supplier contact details." };
    }
    supplierValues = {
      contactName: contactName.data,
      email: email.data || null,
      phone: phone.data || null,
      address: address.data,
    };
  }
  const resourceType = `inventory_${kind}`;
  try {
    await db.transaction(async (tx) => {
      if (kind === "category") await tx.insert(inventoryCategories).values(row);
      else if (kind === "location") await tx.insert(inventoryLocations).values(row);
      else if (supplierValues) await tx.insert(inventorySuppliers).values({ ...row, ...supplierValues });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: `${resourceType}.created`,
        resourceType,
        resourcePublicId: publicId,
        changedFields: kind === "supplier" ? ["name", "contactName", "email", "phone", "address"] : ["name", "description"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: `A ${kind} with that name already exists.` };
    throw error;
  }
  revalidateInventory();
  return { success: true };
}

export async function createInventoryCategory(_state: InventoryActionState, formData: FormData) {
  return createLookupRecord(formData, "category");
}

export async function createInventorySupplier(_state: InventoryActionState, formData: FormData) {
  return createLookupRecord(formData, "supplier");
}

export async function createInventoryLocation(_state: InventoryActionState, formData: FormData) {
  return createLookupRecord(formData, "location");
}

export async function createInventoryItem(_state: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  const context = await requireSchoolPermission("inventory.manage");
  const parsed = z.object({
    categoryId: idField,
    supplierId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
    locationId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
    sku: z.string().trim().min(1).max(80),
    name: nameField,
    description: optionalText,
    unit: z.string().trim().min(1).max(40),
    reorderLevel: z.string().trim(),
  }).safeParse({
    categoryId: value(formData, "categoryId"),
    supplierId: value(formData, "supplierId"),
    locationId: value(formData, "locationId"),
    sku: value(formData, "sku"),
    name: value(formData, "name"),
    description: value(formData, "description"),
    unit: value(formData, "unit"),
    reorderLevel: value(formData, "reorderLevel") || "0",
  });
  const reorderLevel = parseQuantityMilliUnits(parsed.success ? parsed.data.reorderLevel : "");
  if (!parsed.success || reorderLevel === null) return { error: "Enter a valid SKU, item name, unit, category, and reorder level." };
  const [category] = await db.select({ id: inventoryCategories.id }).from(inventoryCategories)
    .where(and(eq(inventoryCategories.id, parsed.data.categoryId), eq(inventoryCategories.schoolId, context.schoolId))).limit(1);
  const [supplier] = parsed.data.supplierId === null ? [null] : await db.select({ id: inventorySuppliers.id }).from(inventorySuppliers)
    .where(and(eq(inventorySuppliers.id, parsed.data.supplierId), eq(inventorySuppliers.schoolId, context.schoolId))).limit(1);
  const [location] = parsed.data.locationId === null ? [null] : await db.select({ id: inventoryLocations.id }).from(inventoryLocations)
    .where(and(eq(inventoryLocations.id, parsed.data.locationId), eq(inventoryLocations.schoolId, context.schoolId))).limit(1);
  if (!category || (parsed.data.supplierId !== null && !supplier) || (parsed.data.locationId !== null && !location)) {
    return { error: "Choose an inventory category, supplier, and location belonging to this school." };
  }
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(inventoryItems).values({
        publicId,
        schoolId: context.schoolId,
        categoryId: category.id,
        supplierId: supplier?.id ?? null,
        locationId: location?.id ?? null,
        sku: parsed.data.sku,
        name: parsed.data.name,
        description: parsed.data.description,
        unit: parsed.data.unit,
        quantityOnHand: "0",
        reorderLevel: formatQuantityMilliUnits(reorderLevel),
        averageUnitCost: "0.00",
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "inventory_item.created",
        resourceType: "inventory_item",
        resourcePublicId: publicId,
        changedFields: ["categoryId", "supplierId", "locationId", "sku", "name", "unit", "reorderLevel"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "An inventory item with that SKU already exists." };
    throw error;
  }
  revalidateInventory();
  return { success: true };
}

export async function recordInventoryMovement(_state: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  const context = await requireSchoolPermission("inventory.manage");
  const parsed = z.object({
    itemId: idField,
    supplierId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
    locationId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
    movementType: z.enum(["received", "issued", "adjustment"]),
    quantity: z.string().trim().min(1),
    unitCost: z.string().trim(),
    reference: z.string().trim().max(120),
    note: z.string().trim().max(500),
  }).safeParse({
    itemId: value(formData, "itemId"),
    supplierId: value(formData, "supplierId"),
    locationId: value(formData, "locationId"),
    movementType: value(formData, "movementType"),
    quantity: value(formData, "quantity"),
    unitCost: value(formData, "unitCost") || "0",
    reference: value(formData, "reference"),
    note: value(formData, "note"),
  });
  if (!parsed.success) return { error: "Enter a valid stock movement." };
  const movementQuantity = parsed.data.movementType === "adjustment"
    ? parseSignedQuantityMilliUnits(parsed.data.quantity)
    : parseQuantityMilliUnits(parsed.data.quantity);
  const unitCost = parseCostMinorUnits(parsed.data.unitCost);
  if (movementQuantity === null || movementQuantity === BigInt(0) || unitCost === null ||
      (parsed.data.movementType === "received" && movementQuantity < BigInt(0)) ||
      (parsed.data.movementType === "issued" && movementQuantity < BigInt(0)) ||
      (parsed.data.movementType !== "received" && unitCost !== BigInt(0))) {
    return { error: "Enter a positive received/issued quantity or a signed adjustment; only receipts can set unit cost." };
  }
  const [supplier] = parsed.data.supplierId === null ? [null] : await db.select({ id: inventorySuppliers.id }).from(inventorySuppliers)
    .where(and(eq(inventorySuppliers.id, parsed.data.supplierId), eq(inventorySuppliers.schoolId, context.schoolId))).limit(1);
  const [location] = parsed.data.locationId === null ? [null] : await db.select({ id: inventoryLocations.id }).from(inventoryLocations)
    .where(and(eq(inventoryLocations.id, parsed.data.locationId), eq(inventoryLocations.schoolId, context.schoolId))).limit(1);
  if ((parsed.data.supplierId !== null && !supplier) || (parsed.data.locationId !== null && !location)) {
    return { error: "Choose a supplier and location belonging to this school." };
  }
  if (parsed.data.movementType === "received" && parsed.data.supplierId === null) {
    return { error: "Choose the supplier for received stock." };
  }
  const outcome = await db.transaction(async (tx) => {
    const [item] = await tx.select({
      id: inventoryItems.id,
      publicId: inventoryItems.publicId,
      quantityOnHand: inventoryItems.quantityOnHand,
      averageUnitCost: inventoryItems.averageUnitCost,
      status: inventoryItems.status,
    }).from(inventoryItems)
      .where(and(eq(inventoryItems.id, parsed.data.itemId), eq(inventoryItems.schoolId, context.schoolId)))
      .for("update").limit(1);
    if (!item || item.status !== "active") return null;
    const currentQuantity = parseQuantityMilliUnits(item.quantityOnHand);
    const currentCost = parseCostMinorUnits(item.averageUnitCost);
    if (currentQuantity === null || currentCost === null) throw new Error("Stored inventory quantity or cost is invalid.");
    const applied = applyStockMovement({
      currentQuantity,
      movementQuantity,
      currentAverageCost: currentCost,
      movementCost: unitCost,
      kind: parsed.data.movementType as StockMovementKind,
    });
    const movementPublicId = randomUUID();
    await tx.update(inventoryItems).set({
      quantityOnHand: formatQuantityMilliUnits(applied.quantityAfter),
      averageUnitCost: formatCostMinorUnits(applied.averageCost),
      ...(supplier ? { supplierId: supplier.id } : {}),
      ...(location ? { locationId: location.id } : {}),
    }).where(eq(inventoryItems.id, item.id));
    await tx.insert(inventoryMovements).values({
      publicId: movementPublicId,
      schoolId: context.schoolId,
      itemId: item.id,
      supplierId: supplier?.id ?? null,
      locationId: location?.id ?? null,
      movementType: parsed.data.movementType,
      quantity: formatQuantityMilliUnits(movementQuantity < BigInt(0) ? -movementQuantity : movementQuantity)
        .replace(/^/, movementQuantity < BigInt(0) ? "-" : ""),
      quantityBefore: formatQuantityMilliUnits(currentQuantity),
      quantityAfter: formatQuantityMilliUnits(applied.quantityAfter),
      unitCost: formatCostMinorUnits(unitCost),
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
      recordedBy: context.user.id,
    });
    await writeAudit(tx, context.schoolId, context.user.id, `inventory_stock.${parsed.data.movementType}`, "inventory_item", item.publicId,
      ["quantityOnHand", "averageUnitCost", "locationId", "supplierId"]);
    return applied.quantityAfter;
  });
  if (outcome === null) return { error: "The selected active inventory item was not found." };
  revalidateInventory();
  return { success: true, message: `Stock updated. New balance: ${formatQuantityMilliUnits(outcome)}.` };
}

export async function createInventoryAsset(_state: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  const context = await requireSchoolPermission("inventory.manage");
  const parsed = z.object({
    itemId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
    locationId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
    assetTag: z.string().trim().min(1).max(80),
    name: nameField,
    description: optionalText,
    acquiredAt: z.string().refine(isCalendarDate),
    acquisitionCost: z.string().trim(),
  }).safeParse({
    itemId: value(formData, "itemId"),
    locationId: value(formData, "locationId"),
    assetTag: value(formData, "assetTag"),
    name: value(formData, "name"),
    description: value(formData, "description"),
    acquiredAt: value(formData, "acquiredAt"),
    acquisitionCost: value(formData, "acquisitionCost"),
  });
  const cost = parseCostMinorUnits(parsed.success ? parsed.data.acquisitionCost : "");
  if (!parsed.success || cost === null) return { error: "Enter a valid asset tag, name, acquisition date, and cost." };
  const [item] = parsed.data.itemId === null ? [null] : await db.select({ id: inventoryItems.id }).from(inventoryItems)
    .where(and(eq(inventoryItems.id, parsed.data.itemId), eq(inventoryItems.schoolId, context.schoolId))).limit(1);
  const [location] = parsed.data.locationId === null ? [null] : await db.select({ id: inventoryLocations.id }).from(inventoryLocations)
    .where(and(eq(inventoryLocations.id, parsed.data.locationId), eq(inventoryLocations.schoolId, context.schoolId))).limit(1);
  if ((parsed.data.itemId !== null && !item) || (parsed.data.locationId !== null && !location)) {
    return { error: "Choose an inventory item and location belonging to this school." };
  }
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(inventoryAssets).values({
        publicId,
        schoolId: context.schoolId,
        itemId: item?.id ?? null,
        locationId: location?.id ?? null,
        assetTag: parsed.data.assetTag,
        name: parsed.data.name,
        description: parsed.data.description,
        acquiredAt: parsed.data.acquiredAt,
        acquisitionCost: formatCostMinorUnits(cost),
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "inventory_asset.created",
        resourceType: "inventory_asset",
        resourcePublicId: publicId,
        changedFields: ["itemId", "locationId", "assetTag", "name", "acquiredAt", "acquisitionCost"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "An asset with that tag already exists." };
    throw error;
  }
  revalidateInventory();
  return { success: true };
}

export async function updateInventoryAsset(_state: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  const context = await requireSchoolPermission("inventory.manage");
  const parsed = z.object({
    assetId: idField,
    locationId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
    status: z.enum(["active", "maintenance", "retired"]),
  }).safeParse({
    assetId: value(formData, "assetId"),
    locationId: value(formData, "locationId"),
    status: value(formData, "status"),
  });
  if (!parsed.success) return { error: "Select a valid asset location and status." };
  const [asset] = await db.select({ id: inventoryAssets.id, publicId: inventoryAssets.publicId })
    .from(inventoryAssets).where(and(eq(inventoryAssets.id, parsed.data.assetId), eq(inventoryAssets.schoolId, context.schoolId))).limit(1);
  const [location] = parsed.data.locationId === null ? [null] : await db.select({ id: inventoryLocations.id }).from(inventoryLocations)
    .where(and(eq(inventoryLocations.id, parsed.data.locationId), eq(inventoryLocations.schoolId, context.schoolId))).limit(1);
  if (!asset || (parsed.data.locationId !== null && !location)) return { error: "Choose an asset and location belonging to this school." };
  await db.transaction(async (tx) => {
    await tx.update(inventoryAssets).set({ locationId: location?.id ?? null, status: parsed.data.status })
      .where(and(eq(inventoryAssets.id, asset.id), eq(inventoryAssets.schoolId, context.schoolId)));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "inventory_asset.updated",
      resourceType: "inventory_asset",
      resourcePublicId: asset.publicId,
      changedFields: ["locationId", "status"],
    });
  });
  revalidateInventory();
  return { success: true };
}

export async function recordAssetMaintenance(_state: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  const context = await requireSchoolPermission("inventory.manage");
  const parsed = z.object({
    assetId: idField,
    maintenanceDate: z.string().refine(isCalendarDate),
    description: z.string().trim().min(1).max(1000),
    cost: z.string().trim(),
    performedBy: z.string().trim().max(160),
  }).safeParse({
    assetId: value(formData, "assetId"),
    maintenanceDate: value(formData, "maintenanceDate"),
    description: value(formData, "description"),
    cost: value(formData, "cost") || "0",
    performedBy: value(formData, "performedBy"),
  });
  const cost = parseCostMinorUnits(parsed.success ? parsed.data.cost : "");
  if (!parsed.success || cost === null) return { error: "Enter a valid maintenance date, description, and cost." };
  const [asset] = await db.select({ id: inventoryAssets.id, publicId: inventoryAssets.publicId }).from(inventoryAssets)
    .where(and(eq(inventoryAssets.id, parsed.data.assetId), eq(inventoryAssets.schoolId, context.schoolId))).limit(1);
  if (!asset) return { error: "Choose an asset belonging to this school." };
  const publicId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(assetMaintenance).values({
      publicId,
      schoolId: context.schoolId,
      assetId: asset.id,
      maintenanceDate: parsed.data.maintenanceDate,
      description: parsed.data.description,
      cost: formatCostMinorUnits(cost),
      performedBy: parsed.data.performedBy || null,
      recordedBy: context.user.id,
    });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "asset_maintenance.created",
      resourceType: "inventory_asset",
      resourcePublicId: asset.publicId,
      changedFields: ["maintenanceDate", "description", "cost", "performedBy"],
    });
  });
  revalidateInventory();
  return { success: true };
}
