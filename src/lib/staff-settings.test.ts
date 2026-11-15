import { describe, expect, it } from "vitest";
import {
  defaultRequiredStaffFields,
  getStaffRequiredFieldError,
  normalizeRequiredStaffFields,
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
});
