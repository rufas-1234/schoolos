import { describe, expect, it } from "vitest";
import { getNewSchoolAdminPasswordError, schoolSignupInputSchema } from "./school-signup-policy";

const validInput = {
  schoolName: " North School ",
  schoolEmail: "",
  schoolPhone: "",
  schoolAddress: "",
  adminName: "School Admin",
  adminEmail: "ADMIN@EXAMPLE.COM",
  password: "A-strong-password-123",
  passwordConfirmation: "A-strong-password-123",
};

describe("school signup policy", () => {
  it("normalizes school signup contact and administrator fields", () => {
    const result = schoolSignupInputSchema.safeParse(validInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schoolName).toBe("North School");
      expect(result.data.schoolEmail).toBeUndefined();
      expect(result.data.adminEmail).toBe("admin@example.com");
    }
  });

  it("rejects mismatched passwords", () => {
    expect(schoolSignupInputSchema.safeParse({
      ...validInput,
      passwordConfirmation: "different-password",
    }).success).toBe(false);
  });

  it("requires strong long passwords for new school administrators", () => {
    expect(getNewSchoolAdminPasswordError("short")).toContain("12 characters");
    expect(getNewSchoolAdminPasswordError("longbutweakpassword")).toContain("uppercase");
    expect(getNewSchoolAdminPasswordError("A-strong-password-123")).toBeNull();
  });
});
