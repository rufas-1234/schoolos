import { describe, expect, it } from "vitest";
import { getStudentRoleId, schoolAccountInputSchema } from "./account-provisioning-policy";

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

describe("school account input validation", () => {
  it("accepts student account submissions when the parent-only login method is absent", () => {
    const result = schoolAccountInputSchema.safeParse({
      personType: "student",
      recordId: "42",
      parentLogin: "",
      password: "student-password",
      passwordConfirmation: "student-password",
      roleIds: ["7"],
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.parentLogin).toBeUndefined();
  });
});
