import { describe, expect, it } from "vitest";
import {
  normalizeAdmissionIdentifier,
  normalizePhoneIdentifier,
} from "./login-identifier-policy";

describe("login identifier normalization", () => {
  it("normalizes admission numbers without changing their significant characters", () => {
    expect(normalizeAdmissionIdentifier("  st-024  ")).toBe("ST-024");
    expect(normalizeAdmissionIdentifier("")).toBe("");
    expect(normalizeAdmissionIdentifier("A".repeat(41))).toBe("");
  });

  it("normalizes common phone formatting and rejects invalid phone numbers", () => {
    expect(normalizePhoneIdentifier("+1 (415) 555-0132")).toBe("+14155550132");
    expect(normalizePhoneIdentifier("415.555.0132")).toBe("4155550132");
    expect(normalizePhoneIdentifier("12345")).toBe("");
    expect(normalizePhoneIdentifier("++14155550132")).toBe("");
  });
});
