import { describe, expect, it } from "vitest";
import {
  getDefaultBranchFilterValue,
  getDefaultBranchId,
  resolveBranchFilterId,
} from "./branch-selection-policy";

const branches = [
  { id: 3, name: "East Campus", code: "EAST" },
  { id: 1, name: "Main Branch", code: "MAIN" },
];

describe("branch selection defaults", () => {
  it("prefers the main branch and falls back to the first available branch", () => {
    expect(getDefaultBranchId(branches)).toBe(1);
    expect(getDefaultBranchId([{ id: 3, name: "East Campus" }])).toBe(3);
    expect(getDefaultBranchId([])).toBeNull();
  });

  it("keeps a valid requested branch and preserves an explicit all-branches choice", () => {
    expect(resolveBranchFilterId(branches, "3")).toBe(3);
    expect(resolveBranchFilterId(branches, "")).toBeNull();
    expect(resolveBranchFilterId(branches, undefined)).toBe(1);
    expect(resolveBranchFilterId(branches, "999")).toBe(1);
  });

  it("uses the main branch for client-side branch filters without selecting unassigned records", () => {
    expect(getDefaultBranchFilterValue([
      { value: "unassigned", label: "Unassigned" },
      { value: "1", label: "Main Branch" },
    ])).toBe("1");
    expect(getDefaultBranchFilterValue([
      { value: "unassigned", label: "Unassigned" },
      { value: "3", label: "East Campus" },
    ])).toBe("3");
    expect(getDefaultBranchFilterValue([{ value: "unassigned", label: "Unassigned" }])).toBe("");
  });
});
