import { describe, expect, it } from "vitest";
import { defaultRolePermissionKeys, schoolAdminPermissionKeys } from "./school-defaults";

describe("default school examination permissions", () => {
  it("allows school administrators, principals, and deputy principals to enter and publish results", () => {
    const examinationPermissions = ["results.enter", "results.publish"];

    expect(schoolAdminPermissionKeys).toEqual(expect.arrayContaining(examinationPermissions));
    expect(defaultRolePermissionKeys.Principal).toEqual(expect.arrayContaining(examinationPermissions));
    expect(defaultRolePermissionKeys["Deputy principal"]).toEqual(expect.arrayContaining(examinationPermissions));
  });
});

describe("default staff payroll permissions", () => {
  it("allows Accountants and school administrators to pay staff payroll", () => {
    expect(defaultRolePermissionKeys.Accountant).toContain("staff.payroll.pay");
    expect(schoolAdminPermissionKeys).toContain("staff.payroll.pay");
    expect(defaultRolePermissionKeys["Human resources officer"]).not.toContain("staff.payroll.pay");
  });
});
