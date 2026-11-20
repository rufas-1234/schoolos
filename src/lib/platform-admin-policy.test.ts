import { describe, expect, it } from "vitest";
import { isSystemSuperAdmin } from "./platform-admin-policy";

describe("system superadmin policy", () => {
  it("recognizes the Super Admin role without granting access to ordinary admin roles", () => {
    expect(isSystemSuperAdmin(null, ["Super Admin"])).toBe(true);
    expect(isSystemSuperAdmin(null, ["System Administrator"])).toBe(true);
    expect(isSystemSuperAdmin(null, ["Administrator"])).toBe(false);
    expect(isSystemSuperAdmin(null, ["Examinations Manager"])).toBe(false);
  });
});
