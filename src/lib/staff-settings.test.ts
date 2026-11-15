import { describe, expect, it } from "vitest";
import {
  defaultRequiredStaffFields,
  defaultVisibleStaffFields,
  getStaffRequiredFieldError,
  normalizeRequiredStaffFields,
  normalizeVisibleStaffFields,
} from "./staff-settings";

describe("staff settings", () => {
  it("always retains required core staff fields", () => {
    expect(normalizeRequiredStaffFields(["email"])).toEqual([
      "branchId",
      "firstName",
      "lastName",
      "jobTitle",
      "department",
      "employmentType",
      "email",
    ]);
  });

  it("validates only the configured required fields", () => {
    const values = {
      branchId: 1,
      firstName: "Ada",
      lastName: "Lovelace",
      jobTitle: "Teacher",
      department: "Academics",
      employmentType: "full_time",
      email: "",
      phone: "",
    };
    expect(getStaffRequiredFieldError(values, defaultRequiredStaffFields)).toBeNull();
    expect(getStaffRequiredFieldError(values, [...defaultRequiredStaffFields, "email"])).toBe("Email is required.");
  });

  it("always keeps required core fields visible and ignores unknown visibility settings", () => {
    const expected = [
      ...defaultRequiredStaffFields,
      "email",
    ].sort((first, second) =>
      defaultVisibleStaffFields.indexOf(first) - defaultVisibleStaffFields.indexOf(second),
    );
    expect(normalizeVisibleStaffFields(["email", "unknown"])).toEqual(expected);
    expect(normalizeVisibleStaffFields(null)).toEqual(defaultVisibleStaffFields);
  });
});
