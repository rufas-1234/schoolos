export type StockMovementKind = "received" | "issued" | "adjustment";
export type InventoryView = "setup" | "register" | "movements" | "assets" | "maintenance";

export function resolveInventoryView(view: string | undefined, legacySection?: string): InventoryView {
  if (view === "setup" || view === "register" || view === "movements" ||
    view === "assets" || view === "maintenance") return view;
  return legacySection === "assets" ? "assets" : "register";
}

export function parseQuantityMilliUnits(value: string): bigint | null {
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(3, "0");
  return BigInt(match[1]) * BigInt(1000) + BigInt(fraction || "0");
}

export function parseSignedQuantityMilliUnits(value: string): bigint | null {
  const match = /^(-?)(0|[1-9]\d{0,8})(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = (match[3] ?? "").padEnd(3, "0");
  const quantity = BigInt(match[2]) * BigInt(1000) + BigInt(fraction || "0");
  return match[1] === "-" ? -quantity : quantity;
}

export function parseCostMinorUnits(value: string): bigint | null {
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
}

export function applyStockMovement({
  currentQuantity,
  movementQuantity,
  currentAverageCost,
  movementCost,
  kind,
}: {
  currentQuantity: bigint;
  movementQuantity: bigint;
  currentAverageCost: bigint;
  movementCost: bigint;
  kind: StockMovementKind;
}): { quantityAfter: bigint; averageCost: bigint } {
  if (
    currentQuantity < BigInt(0) ||
    movementQuantity === BigInt(0) ||
    (kind !== "adjustment" && movementQuantity < BigInt(0)) ||
    currentAverageCost < BigInt(0) ||
    movementCost < BigInt(0)
  ) {
    throw new Error("Stock quantities and costs must be valid non-negative values.");
  }
  const delta = kind === "received"
    ? movementQuantity
    : kind === "issued"
      ? -movementQuantity
      : movementQuantity;
  const quantityAfter = currentQuantity + delta;
  if (quantityAfter < BigInt(0)) throw new Error("Insufficient stock for this issue or adjustment.");
  if (kind !== "received" || quantityAfter === BigInt(0)) {
    return { quantityAfter, averageCost: quantityAfter === BigInt(0) ? BigInt(0) : currentAverageCost };
  }
  const valueInMilliCents = currentQuantity * currentAverageCost + movementQuantity * movementCost;
  return {
    quantityAfter,
    averageCost: (valueInMilliCents + quantityAfter / BigInt(2)) / quantityAfter,
  };
}

export function formatQuantityMilliUnits(value: bigint): string {
  const whole = value / BigInt(1000);
  const fraction = (value % BigInt(1000)).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function formatCostMinorUnits(value: bigint): string {
  return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;
}
