import { describe, expect, it } from "vitest";
import { getExamCardEligibility } from "./exam-card-policy";

describe("getExamCardEligibility", () => {
  it("clears students with no outstanding fees", () => {
    expect(getExamCardEligibility(0)).toBe("fees-cleared");
  });

  it("requires a recorded reason to issue a card with an outstanding balance", () => {
    expect(getExamCardEligibility(12500)).toBe("fees-outstanding");
    expect(getExamCardEligibility(12500, "Approved scholarship")).toBe("approved-exception");
    expect(getExamCardEligibility(12500, "   ")).toBe("fees-outstanding");
  });

  it("rejects invalid balances rather than issuing an unclear eligibility result", () => {
    expect(() => getExamCardEligibility(-1)).toThrow(RangeError);
    expect(() => getExamCardEligibility(Number.NaN)).toThrow(RangeError);
  });
});
