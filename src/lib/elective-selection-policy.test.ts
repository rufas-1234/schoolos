import { describe, expect, it } from "vitest";
import { getElectiveAttendanceDefault, resolveElectiveRoster } from "./elective-selection-policy";

describe("getElectiveAttendanceDefault", () => {
  it("defaults confirmed non-participants to not applicable", () => {
    expect(getElectiveAttendanceDefault("not_selected", null)).toBe("not_applicable");
    expect(getElectiveAttendanceDefault("not_selected", "present")).toBe("not_applicable");
  });

  it("leaves selected and pending students blank unless selected students have saved attendance", () => {
    expect(getElectiveAttendanceDefault("selected", null)).toBeNull();
    expect(getElectiveAttendanceDefault("selected", "present")).toBe("present");
    expect(getElectiveAttendanceDefault("selected", "not_applicable")).toBeNull();
    expect(getElectiveAttendanceDefault("pending", "present")).toBeNull();
    expect(getElectiveAttendanceDefault(null, null)).toBeNull();
  });
});

describe("resolveElectiveRoster", () => {
  it("includes only selected optional-subject students and reports unresolved choices", () => {
    expect(resolveElectiveRoster([
      { enrollmentId: 1, selectionStatus: "selected" },
      { enrollmentId: 2, selectionStatus: "not_selected" },
      { enrollmentId: 3, selectionStatus: null },
    ], false)).toEqual({
      pendingEnrollmentIds: [3],
      participantEnrollmentIds: [1],
    });
  });

  it("keeps every compulsory-subject student on the roster", () => {
    expect(resolveElectiveRoster([
      { enrollmentId: 1, selectionStatus: null },
    ], true)).toEqual({
      pendingEnrollmentIds: [],
      participantEnrollmentIds: [1],
    });
  });
});
