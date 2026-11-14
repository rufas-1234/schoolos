import { describe, expect, it } from "vitest";
import {
  calculateDiscountMinorUnits,
  calculateFineMinorUnits,
  feePaymentDateRangeInTimezone,
  feeInvoiceStatus,
  isPayDateOnOrAfterDueDate,
  parseMoneyToMinorUnits,
} from "./fees-policy";

describe("fees policies", () => {
  it("parses money exactly to minor units", () => {
    expect(parseMoneyToMinorUnits("125")).toBe(12500);
    expect(parseMoneyToMinorUnits("12.3")).toBe(1230);
    expect(parseMoneyToMinorUnits("12.34")).toBe(1234);
    expect(parseMoneyToMinorUnits("-1")).toBeNull();
    expect(parseMoneyToMinorUnits("1.234")).toBeNull();
  });

  it("caps fixed and percentage discounts at the fee amount", () => {
    expect(calculateDiscountMinorUnits(10000, "fixed", "15.50")).toBe(1550);
    expect(calculateDiscountMinorUnits(5, "percentage", "10.00")).toBe(1);
    expect(calculateDiscountMinorUnits(10000, "fixed", 15.5)).toBe(1550);
    expect(calculateDiscountMinorUnits(10000, "percentage", 12.5)).toBe(1250);
    expect(calculateDiscountMinorUnits(1, "percentage", 50)).toBe(1);
    expect(calculateDiscountMinorUnits(10000, "percentage", 120)).toBeNull();
    expect(calculateDiscountMinorUnits(10000, "fixed", 110)).toBe(10000);
    expect(calculateDiscountMinorUnits(10000, "unknown", 1)).toBeNull();
  });

  it("calculates configured fixed and percentage late fines", () => {
    expect(calculateFineMinorUnits(10000, "none", 0)).toBe(0);
    expect(calculateFineMinorUnits(10000, "fixed", 25)).toBe(2500);
    expect(calculateFineMinorUnits(10000, "percentage", 2.5)).toBe(250);
    expect(calculateFineMinorUnits(101, "percentage", 2.5)).toBe(3);
    expect(calculateFineMinorUnits(10000, "percentage", 101)).toBeNull();
  });

  it("derives unpaid, partial, and paid states from minor-unit totals", () => {
    expect(feeInvoiceStatus(1000, 0)).toBe("unpaid");
    expect(feeInvoiceStatus(1000, 1)).toBe("partial");
    expect(feeInvoiceStatus(1000, 1000)).toBe("paid");
    expect(feeInvoiceStatus(1000, 1001)).toBeNull();
  });

  it("validates the payment date before considering a late fee", () => {
    expect(isPayDateOnOrAfterDueDate("2026-04-01", "2026-04-01")).toBe(true);
    expect(isPayDateOnOrAfterDueDate("2026-03-31", "2026-04-01")).toBe(false);
    expect(isPayDateOnOrAfterDueDate("invalid", "2026-04-01")).toBe(false);
  });

  it("uses the school's timezone for inclusive report date ranges", () => {
    const range = feePaymentDateRangeInTimezone("2026-03-08", "2026-03-08", "America/Los_Angeles");
    expect(range?.start.toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(range?.endExclusive.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect(feePaymentDateRangeInTimezone("2026-04-02", "2026-04-01", "UTC")).toBeNull();
  });
});
