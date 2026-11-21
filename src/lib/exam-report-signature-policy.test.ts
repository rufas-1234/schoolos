import { describe, expect, it } from "vitest";
import { isDeputyHeadteacherJobTitle } from "./exam-report-signature-policy";

describe("deputy headteacher report signatures", () => {
  it("recognizes deputy head titles with common separators and spacing", () => {
    expect(isDeputyHeadteacherJobTitle("Deputy Headteacher")).toBe(true);
    expect(isDeputyHeadteacherJobTitle("Deputy Head Teacher")).toBe(true);
    expect(isDeputyHeadteacherJobTitle("Deputy-Head of School")).toBe(true);
  });

  it("does not include other teaching roles or missing titles", () => {
    expect(isDeputyHeadteacherJobTitle("Class Teacher")).toBe(false);
    expect(isDeputyHeadteacherJobTitle("Deputy Teacher")).toBe(false);
    expect(isDeputyHeadteacherJobTitle(null)).toBe(false);
  });
});
