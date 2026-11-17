import { describe, expect, it } from "vitest";
import {
  calculateLibraryAvailability,
  getDefaultLoanDueDate,
  isFutureLibraryDueDate,
} from "./library-policy";

describe("library lending policy", () => {
  it("calculates a 14-day due date across month and year boundaries", () => {
    expect(getDefaultLoanDueDate("2026-12-24")).toBe("2027-01-07");
    expect(getDefaultLoanDueDate("2026-02-30")).toBeNull();
  });

  it("requires a valid future due date", () => {
    expect(isFutureLibraryDueDate("2026-11-18", "2026-11-17")).toBe(true);
    expect(isFutureLibraryDueDate("2026-11-17", "2026-11-17")).toBe(false);
    expect(isFutureLibraryDueDate("2026-02-30", "2026-02-01")).toBe(false);
  });

  it("prevents reducing copies below the number currently on loan", () => {
    expect(calculateLibraryAvailability(5, 2, 4)).toBe(1);
    expect(calculateLibraryAvailability(5, 2, 2)).toBeNull();
    expect(calculateLibraryAvailability(0, 0, 2)).toBeNull();
  });
});
