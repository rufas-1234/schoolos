import { describe, expect, it } from "vitest";
import { canTransitionStudentStatus, getStudentStatusTransitions } from "./student-policy";

describe("student status policy", () => {
  it("allows only valid admission and enrollment transitions", () => {
    expect(getStudentStatusTransitions("pending")).toEqual(["admitted", "rejected"]);
    expect(getStudentStatusTransitions("admitted")).toContain("active");
    expect(canTransitionStudentStatus("active", "inactive")).toBe(true);
    expect(canTransitionStudentStatus("active", "disabled")).toBe(true);
    expect(canTransitionStudentStatus("disabled", "active")).toBe(true);
    expect(canTransitionStudentStatus("rejected", "pending")).toBe(true);
  });

  it("rejects skipped or unsupported status transitions", () => {
    expect(canTransitionStudentStatus("pending", "active")).toBe(false);
    expect(canTransitionStudentStatus("active", "admitted")).toBe(false);
    expect(canTransitionStudentStatus("rejected", "active")).toBe(false);
    expect(canTransitionStudentStatus("pending", "disabled")).toBe(false);
    expect(canTransitionStudentStatus("disabled", "inactive")).toBe(false);
    expect(canTransitionStudentStatus("unknown", "active")).toBe(false);
  });
});
