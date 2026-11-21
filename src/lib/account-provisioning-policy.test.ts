import { describe, expect, it } from "vitest";
import {
  getStudentRoleId,
  getStudentsEligibleForAccount,
  schoolAccountInputSchema,
} from "./account-provisioning-policy";

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

describe("student account eligibility", () => {
  it("excludes admission numbers already used by any login identifier regardless of case", () => {
    const eligible = getStudentsEligibleForAccount([
      { id: 1, admissionNumber: "ST-001" },
      { id: 2, admissionNumber: "ST-002" },
      { id: 3, admissionNumber: null },
    ], ["st-001"]);

    expect(eligible.map((student) => student.id)).toEqual([2]);
  });
});

describe("school account input validation", () => {
  it("accepts student account submissions without asking an administrator to set a password", () => {
    const result = schoolAccountInputSchema.safeParse({
      personType: "student",
      recordId: "42",
      parentLogin: "",
      roleIds: ["7"],
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.parentLogin).toBeUndefined();
  });

  it("rejects administrator-supplied passwords for staff and student accounts", () => {
    for (const personType of ["staff", "student"] as const) {
      const result = schoolAccountInputSchema.safeParse({
        personType,
        recordId: "42",
        roleIds: ["7"],
        password: "A-strong-password-123!",
        passwordConfirmation: "A-strong-password-123!",
      });

      expect(result.success).toBe(false);
    }
  });
});
