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
