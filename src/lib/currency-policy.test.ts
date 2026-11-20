import { describe, expect, it } from "vitest";
import { formatCurrencyMinorUnits, isSupportedCurrencyCode } from "./currency-policy";

describe("currency policy", () => {
  it("accepts supported uppercase ISO currency codes only", () => {
    expect(isSupportedCurrencyCode("USD")).toBe(true);
    expect(isSupportedCurrencyCode("EUR")).toBe(true);
    expect(isSupportedCurrencyCode("usd")).toBe(false);
    expect(isSupportedCurrencyCode("US")).toBe(false);
    expect(isSupportedCurrencyCode("ZZZ")).toBe(false);
  });

  it("formats minor units with an explicit ISO code and two decimal places", () => {
    expect(formatCurrencyMinorUnits(125050, "USD")).toBe("$1,250.50");
    expect(formatCurrencyMinorUnits(1200, "JPY")).toContain("12.00");
  });
});
