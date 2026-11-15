import { describe, expect, it } from "vitest";
import {
  defaultStudentFieldSettings,
  formatStudentIdentifier,
  isValidStudentIdentifierFormat,
  normalizeStudentFieldSettings,
} from "./student-settings";

describe("student settings", () => {
  it("uses short generated identifiers with supported date and sequence tokens", () => {
    expect(formatStudentIdentifier("S{YY}{SEQ:4}", 12, "2026-03-05")).toBe("S260012");
    expect(formatStudentIdentifier("R-{SEQ:3}", 7, "2026-03-05")).toBe("R-007");
    expect(formatStudentIdentifier("{YYYY}{MM}{DD}-{SEQ:2}", 3, "2026-03-05")).toBe("20260305-03");
  });

  it("rejects unsafe identifier formats and sequence values", () => {
    expect(isValidStudentIdentifierFormat("STU-{YY}-{SEQ:4}")).toBe(true);
    expect(isValidStudentIdentifierFormat("STU-{YY}")).toBe(false);
    expect(isValidStudentIdentifierFormat("{SEQ:0}")).toBe(false);
    expect(formatStudentIdentifier("{SEQ}", 0, "2026-03-05")).toBeNull();
    expect(formatStudentIdentifier("{SEQ}", 1, "2026-02-30")).toBeNull();
    expect(formatStudentIdentifier(`${"A".repeat(38)}{SEQ:3}`, 1, "2026-03-05")).toBeNull();
  });

  it("keeps required identity fields enabled and fills missing settings defaults", () => {
    const settings = normalizeStudentFieldSettings({
      phone: { enabled: false, required: false },
      firstName: { enabled: false, required: false },
    });
    expect(settings.firstName).toEqual({ enabled: true, required: true });
    expect(settings.classSectionId).toEqual({ enabled: true, required: true });
    expect(settings.phone).toEqual({ enabled: false, required: false });
    expect(settings.guardianName).toEqual(defaultStudentFieldSettings.guardianName);
  });
});
