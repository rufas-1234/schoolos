import { describe, expect, it } from "vitest";
import {
  canTransitionAcademicYear,
  doDateRangesOverlap,
  doTimeRangesOverlap,
  isCalendarDate,
  isDateRangeWithin,
  isValidDateRange,
  isValidTimeRange,
  isValidEnrollmentOperation,
  isValidOptionalDateRange,
  normalizeClassName,
} from "./academic-policy";

describe("class name policy", () => {
  it("normalizes whitespace and case for uniqueness checks", () => {
    expect(normalizeClassName("  Primary   One ")).toBe("primary one");
    expect(normalizeClassName("PRIMARY ONE")).toBe("primary one");
  });
});

describe("class routine time policy", () => {
  it("accepts valid, increasing 24-hour time ranges", () => {
    expect(isValidTimeRange("08:00", "08:45")).toBe(true);
    expect(isValidTimeRange("23:00", "23:59")).toBe(true);
    expect(isValidTimeRange("09:00", "09:00")).toBe(false);
    expect(isValidTimeRange("25:00", "26:00")).toBe(false);
    expect(isValidTimeRange("9:00", "10:00")).toBe(false);
  });

  it("detects intersecting periods but permits adjacent periods", () => {
    expect(doTimeRangesOverlap("08:00", "08:45", "08:30", "09:00")).toBe(true);
    expect(doTimeRangesOverlap("08:00", "08:45", "08:45", "09:30")).toBe(false);
  });
});

describe("academic date policy", () => {
  it("accepts real calendar dates and ordered ranges", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isValidDateRange("2026-01-01", "2026-12-31")).toBe(true);
    expect(isValidDateRange("2026-12-31", "2026-01-01")).toBe(false);
  });

  it("rejects malformed or impossible calendar dates", () => {
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("26-01-01")).toBe(false);
  });

  it("keeps a term inside its academic year", () => {
    expect(
      isDateRangeWithin("2026-04-01", "2026-06-30", "2026-01-01", "2026-12-31"),
    ).toBe(true);
    expect(
      isDateRangeWithin("2025-12-01", "2026-03-31", "2026-01-01", "2026-12-31"),
    ).toBe(false);
  });

  it("detects overlapping academic-year and term date ranges", () => {
    expect(doDateRangesOverlap("2026-01-01", "2026-12-31", "2026-12-31", "2027-06-30")).toBe(
      true,
    );
    expect(doDateRangesOverlap("2026-01-01", "2026-06-30", "2026-07-01", "2026-12-31")).toBe(
      false,
    );
    expect(doDateRangesOverlap("2026-02-30", "2026-03-01", "2026-03-01", "2026-04-01")).toBe(
      false,
    );
  });

  it("allows optional exam periods only when both dates fit inside the term", () => {
    expect(isValidOptionalDateRange(null, null, "2026-01-01", "2026-12-31")).toBe(true);
    expect(
      isValidOptionalDateRange("2026-06-01", "2026-06-10", "2026-01-01", "2026-12-31"),
    ).toBe(true);
    expect(
      isValidOptionalDateRange("2026-06-01", null, "2026-01-01", "2026-12-31"),
    ).toBe(false);
    expect(
      isValidOptionalDateRange("2025-12-20", "2026-01-05", "2026-01-01", "2026-12-31"),
    ).toBe(false);
  });

  it("keeps archived academic years immutable and only activates or archives other years", () => {
    expect(canTransitionAcademicYear("planned", "active")).toBe(true);
    expect(canTransitionAcademicYear("active", "archived")).toBe(true);
    expect(canTransitionAcademicYear("archived", "active")).toBe(false);
    expect(canTransitionAcademicYear("active", "planned")).toBe(false);
    expect(canTransitionAcademicYear("unknown", "active")).toBe(false);
  });

  it("validates promotion, repetition, in-school transfer, transfer-out, and graduation inputs", () => {
    const shared = {
      sourceYearStartDate: "2025-01-01",
      sourceClassLevelId: 1,
      sourceSectionId: 10,
    };
    expect(
      isValidEnrollmentOperation({
        ...shared,
        operation: "promote",
        targetYearStartDate: "2026-01-01",
        targetClassLevelId: 2,
        targetSectionId: 20,
      }),
    ).toBe(true);
    expect(
      isValidEnrollmentOperation({
        ...shared,
        operation: "repeat",
        targetYearStartDate: "2026-01-01",
        targetClassLevelId: 1,
        targetSectionId: 20,
      }),
    ).toBe(true);
    expect(
      isValidEnrollmentOperation({
        ...shared,
        operation: "repeat",
        targetYearStartDate: "2026-01-01",
        targetClassLevelId: 2,
        targetSectionId: 20,
      }),
    ).toBe(false);
    expect(
      isValidEnrollmentOperation({
        ...shared,
        operation: "transfer_in_school",
        targetYearStartDate: "2025-01-01",
        targetClassLevelId: 1,
        targetSectionId: 11,
      }),
    ).toBe(true);
    expect(isValidEnrollmentOperation({ ...shared, operation: "transfer_out" })).toBe(true);
    expect(isValidEnrollmentOperation({ ...shared, operation: "graduate" })).toBe(true);
  });
});
