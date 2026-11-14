import { describe, expect, it } from "vitest";
import { canEditRole } from "./role-policy";

describe("role editing policy", () => {
  it("allows editing custom roles whether assigned or not", () => {
    expect(canEditRole(false, 0)).toBe(true);
    expect(canEditRole(false, 3)).toBe(true);
  });

  it("allows editing system roles only while they are unassigned", () => {
    expect(canEditRole(true, 0)).toBe(true);
    expect(canEditRole(true, 1)).toBe(false);
  });
});
