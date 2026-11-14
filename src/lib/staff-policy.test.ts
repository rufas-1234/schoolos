import { describe, expect, it } from "vitest";
import {
  canTransitionStaffStatus,
  employmentTypes,
  staffContractTypes,
  staffGenders,
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
});
