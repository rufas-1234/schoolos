import { describe, expect, it } from "vitest";
import {
  isValidStudentCategoryName,
  normalizeStudentCategoryName,
} from "./student-category-policy";

describe("student category names", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeStudentCategoryName("  Special   Support  ")).toBe("Special Support");
  });

  it("accepts non-empty names up to 120 characters", () => {
    expect(isValidStudentCategoryName("ADHD")).toBe(true);
    expect(isValidStudentCategoryName("x".repeat(120))).toBe(true);
  });

  it("rejects empty names and names over the database limit", () => {
    expect(isValidStudentCategoryName("   ")).toBe(false);
    expect(isValidStudentCategoryName("x".repeat(121))).toBe(false);
  });
});
