import { describe, expect, it } from "vitest";
import { buildFinanceTrend, getFinanceMonthKeys } from "./finance-overview";

describe("finance overview trend", () => {
  it("creates six consecutive month keys across a year boundary", () => {
    expect(getFinanceMonthKeys("2026-02-14", 6)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("nets reversals, separates currencies and fills missing months with zeroes", () => {
    const trend = buildFinanceTrend(
      ["2026-01", "2026-02"],
      "KES",
      [
        { month: "2026-01", currency: "KES", amount: "1000.00" },
        { month: "2026-01", currency: "USD", amount: "50.00" },
      ],
      [{ month: "2026-01", currency: "KES", amount: "125.50" }],
      [
        { month: "2026-01", currency: "KES", transactionType: "income", amount: "75.25" },
        { month: "2026-01", currency: "KES", transactionType: "expense", amount: "300.00" },
      ],
    );

    expect(trend).toEqual([
      {
        month: "2026-01",
        feeCollections: BigInt(87450),
        otherIncome: BigInt(7525),
        expenses: BigInt(30000),
      },
      {
        month: "2026-02",
        feeCollections: BigInt(0),
        otherIncome: BigInt(0),
        expenses: BigInt(0),
      },
    ]);
  });
});
