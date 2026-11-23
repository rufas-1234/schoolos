import { describe, expect, it } from "vitest";
import { resolveSchoolAcademicYear, type SchoolAcademicYear } from "./academic-year-policy";

const years: SchoolAcademicYear[] = [
  { id: 8, name: "2025-2026", status: "active", startDate: "2025-09-01", endDate: "2026-08-31" },
  { id: 5, name: "2024-2025", status: "archived", startDate: "2024-09-01", endDate: "2025-08-31" },
];

describe("school academic year selection", () => {
  it("uses a valid saved year before the active year", () => {
    expect(resolveSchoolAcademicYear(years, "5")?.name).toBe("2024-2025");
  });

  it("falls back to the active year for an invalid or stale selection", () => {
    expect(resolveSchoolAcademicYear(years, "999")?.id).toBe(8);
    expect(resolveSchoolAcademicYear(years, "not-a-number")?.id).toBe(8);
  });

  it("uses the newest available year if none is marked active", () => {
    expect(resolveSchoolAcademicYear(years.map((year) => ({ ...year, status: "archived" })), undefined)?.id)
      .toBe(8);
  });
});
