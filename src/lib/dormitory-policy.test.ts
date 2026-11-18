import { describe, expect, it } from "vitest";
import { hasDormitoryCapacity, isDormitoryGenderCompatible } from "./dormitory-policy";

describe("dormitory assignment policy", () => {
  it("only assigns students to a gender-compatible dormitory", () => {
    expect(isDormitoryGenderCompatible("male", "male")).toBe(true);
    expect(isDormitoryGenderCompatible("female", "male")).toBe(false);
    expect(isDormitoryGenderCompatible("female", null)).toBe(false);
    expect(isDormitoryGenderCompatible("mixed", null)).toBe(true);
  });

  it("prevents assignments when a room is full or capacity is invalid", () => {
    expect(hasDormitoryCapacity(4, 3)).toBe(true);
    expect(hasDormitoryCapacity(4, 4)).toBe(false);
    expect(hasDormitoryCapacity(0, 0)).toBe(false);
  });
});
