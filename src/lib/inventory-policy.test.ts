import { describe, expect, it } from "vitest";
import {
  applyStockMovement,
  formatCostMinorUnits,
  formatQuantityMilliUnits,
  parseCostMinorUnits,
  parseQuantityMilliUnits,
  parseSignedQuantityMilliUnits,
} from "./inventory-policy";

describe("inventory stock policy", () => {
  it("parses quantities and costs without floating point arithmetic", () => {
    expect(parseQuantityMilliUnits("12.35")).toBe(BigInt(12350));
    expect(parseCostMinorUnits("17.40")).toBe(BigInt(1740));
    expect(parseQuantityMilliUnits("1.2345")).toBeNull();
    expect(parseSignedQuantityMilliUnits("-0.125")).toBe(BigInt(-125));
    expect(formatQuantityMilliUnits(BigInt(1250))).toBe("1.25");
    expect(formatCostMinorUnits(BigInt(125))).toBe("1.25");
  });

  it("updates weighted average cost on receipts and preserves it on issues", () => {
    expect(applyStockMovement({
      currentQuantity: BigInt(10000),
      movementQuantity: BigInt(5000),
      currentAverageCost: BigInt(100),
      movementCost: BigInt(200),
      kind: "received",
    })).toEqual({ quantityAfter: BigInt(15000), averageCost: BigInt(133) });
    expect(applyStockMovement({
      currentQuantity: BigInt(10000),
      movementQuantity: BigInt(3000),
      currentAverageCost: BigInt(100),
      movementCost: BigInt(0),
      kind: "issued",
    })).toEqual({ quantityAfter: BigInt(7000), averageCost: BigInt(100) });
  });

  it("supports signed adjustments while preventing negative stock", () => {
    expect(applyStockMovement({
      currentQuantity: BigInt(1000),
      movementQuantity: BigInt(200),
      currentAverageCost: BigInt(100),
      movementCost: BigInt(0),
      kind: "adjustment",
    }).quantityAfter).toBe(BigInt(1200));
    expect(applyStockMovement({
      currentQuantity: BigInt(1000),
      movementQuantity: BigInt(-200),
      currentAverageCost: BigInt(100),
      movementCost: BigInt(0),
      kind: "adjustment",
    }).quantityAfter).toBe(BigInt(800));
    expect(() => applyStockMovement({
      currentQuantity: BigInt(1000),
      movementQuantity: BigInt(-1200),
      currentAverageCost: BigInt(100),
      movementCost: BigInt(0),
      kind: "adjustment",
    })).toThrow("Insufficient stock");
  });
});
