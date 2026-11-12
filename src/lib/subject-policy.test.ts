import { describe, expect, it } from "vitest";
import { isValidSubjectCode, normalizeSubjectCode } from "./subject-policy";

describe("subject policy", () => {
  it("normalizes school subject codes before checking them", () => {
    expect(normalizeSubjectCode(" sci-1 ")).toBe("SCI-1");
    expect(isValidSubjectCode("SCI-1")).toBe(true);
    expect(isValidSubjectCode("MATH_2")).toBe(true);
    expect(isValidSubjectCode("S")).toBe(true);
  });

  it("rejects empty, oversized, or unsupported subject codes", () => {
    expect(isValidSubjectCode("")).toBe(false);
    expect(isValidSubjectCode("SCI 1")).toBe(false);
    expect(isValidSubjectCode("A".repeat(21))).toBe(false);
  });
});
