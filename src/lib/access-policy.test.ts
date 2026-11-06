import { describe, expect, it } from "vitest";
import { hasPermission, requireSingleSchoolMembership } from "./access-policy";

describe("school access policy", () => {
  it("uses the only active membership as the tenant context", () => {
    const membership = { membershipId: 7, schoolId: 21, schoolName: "Example School" };
    expect(requireSingleSchoolMembership([membership])).toEqual(membership);
  });

  it("rejects accounts without an active school membership", () => {
    expect(() => requireSingleSchoolMembership([])).toThrow("no active school membership");
  });

  it("requires an explicit school choice when multiple memberships exist", () => {
    expect(() =>
      requireSingleSchoolMembership([
        { membershipId: 7, schoolId: 21, schoolName: "North School" },
        { membershipId: 8, schoolId: 22, schoolName: "South School" },
      ]),
    ).toThrow("Select an authorized school");
  });

  it("matches exact permissions and denies unassigned capabilities", () => {
    expect(hasPermission(["dashboard.view", "school.settings.manage"], "dashboard.view")).toBe(true);
    expect(hasPermission(["dashboard.view"], "dashboard.views")).toBe(false);
    expect(hasPermission([], "school.settings.manage")).toBe(false);
  });
});
