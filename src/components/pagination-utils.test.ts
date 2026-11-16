import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, parsePageSize } from "./pagination-utils";

describe("pagination page size", () => {
  it("accepts configured page sizes from search parameters", () => {
    expect(parsePageSize("10")).toBe(10);
    expect(parsePageSize(["100", "25"])).toBe(100);
  });

  it("uses the default for missing or unsupported values", () => {
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("0")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("all")).toBe(DEFAULT_PAGE_SIZE);
  });
});
