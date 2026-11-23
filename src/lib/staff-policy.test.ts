import { describe, expect, it } from "vitest";
import {
  canTransitionStaffStatus,
  employmentTypes,
  getStaffLoginPasswordError,
  getStaffRolePagination,
  staffContractTypes,
  staffGenders,
  staffLoginPasswordMinLength,
  staffMaritalStatuses,
  staffRoles,
  staffStatuses,
} from "./staff-policy";

describe("staff directory policies", () => {
  it("supports the defined employment types and statuses", () => {
    expect(employmentTypes).toEqual(["full_time", "part_time", "contract", "temporary"]);
    expect(staffStatuses).toEqual(["active", "inactive"]);
  });

  it("supports the Infix staff profile selections", () => {
    expect(staffRoles).toEqual(["accountant", "admin", "driver", "librarian", "receptionist", "teacher"]);
    expect(staffGenders).toEqual(["female", "male", "other"]);
    expect(staffMaritalStatuses).toEqual(["married", "unmarried"]);
    expect(staffContractTypes).toEqual(["permanent", "contract"]);
  });

  it("allows active staff to be deactivated and inactive staff to be reactivated", () => {
    expect(canTransitionStaffStatus("active", "inactive")).toBe(true);
    expect(canTransitionStaffStatus("inactive", "active")).toBe(true);
  });

  it("rejects unchanged and unknown status transitions", () => {
    expect(canTransitionStaffStatus("active", "active")).toBe(false);
    expect(canTransitionStaffStatus("inactive", "inactive")).toBe(false);
    expect(canTransitionStaffStatus("pending", "active")).toBe(false);
  });

  it("bounds staff role pagination for empty, invalid, and out-of-range pages", () => {
    expect(getStaffRolePagination(0, 5)).toEqual({ page: 1, pageCount: 1 });
    expect(getStaffRolePagination(17, 0)).toEqual({ page: 1, pageCount: 3 });
    expect(getStaffRolePagination(17, 99)).toEqual({ page: 3, pageCount: 3 });
  });

  it("allows blank password fields for existing accounts and validates supplied passwords", () => {
    expect(getStaffLoginPasswordError("", "")).toBeNull();
    expect(getStaffLoginPasswordError("short", "short")).toContain("at least");
    const password = "StrongStaff9!";
    expect(password.length).toBeGreaterThanOrEqual(staffLoginPasswordMinLength);
    expect(getStaffLoginPasswordError(password, "different-password")).toBe("The passwords do not match.");
    expect(getStaffLoginPasswordError(password, password)).toBeNull();
  });
});
