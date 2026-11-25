import { describe, expect, it } from "vitest";
import { nextGeneratedChartAccountCode } from "./account-code-policy";

describe("generated chart account codes", () => {
  it("uses short numeric ranges and skips codes already in use", () => {
    expect(nextGeneratedChartAccountCode("asset", ["1100"])).toBe("1101");
    expect(nextGeneratedChartAccountCode("income", ["4200", "4202"])).toBe("4201");
    expect(nextGeneratedChartAccountCode("expense", ["5600"])).toBe("5601");
  });

  it("returns no code when the reserved range is full", () => {
    const incomeCodes = Array.from({ length: 800 }, (_, index) => String(4200 + index));

    expect(nextGeneratedChartAccountCode("income", incomeCodes)).toBeNull();
  });
});
