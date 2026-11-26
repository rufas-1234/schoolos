import { describe, expect, it } from "vitest";
import { normalizeSectionName } from "./student-import-policy";

describe("student import policy", () => {
  it("matches section labels with or without the Section prefix", () => {
    expect(normalizeSectionName(" Section A ")).toBe(normalizeSectionName("A"));
    expect(normalizeSectionName("section B")).toBe(normalizeSectionName("b"));
  });
});
