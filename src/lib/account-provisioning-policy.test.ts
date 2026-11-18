import { describe, expect, it } from "vitest";
import { getStudentRoleId } from "./account-provisioning-policy";

describe("student account role defaults", () => {
  it("finds the Student role without depending on its letter casing or surrounding whitespace", () => {
    expect(getStudentRoleId([
      { id: 1, name: "Teacher" },
      { id: 2, name: " student " },
    ])).toBe(2);
  });

  it("returns null when the school has no Student role", () => {
    expect(getStudentRoleId([{ id: 1, name: "Teacher" }])).toBeNull();
  });
});
