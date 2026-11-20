import { describe, expect, it } from "vitest";
import {
  canApproveSchool,
  canRejectSchool,
  canReopenSchoolReview,
  getSchoolDisplayStatus,
  isSchoolAvailable,
} from "./school-lifecycle-policy";

describe("school lifecycle policy", () => {
  it("only exposes approved, non-archived schools", () => {
    expect(isSchoolAvailable("active", null)).toBe(true);
    expect(isSchoolAvailable("pending", null)).toBe(false);
    expect(isSchoolAvailable("rejected", null)).toBe(false);
    expect(isSchoolAvailable("active", new Date())).toBe(false);
  });

  it("allows approval of pending or rejected applications, but rejects only pending ones", () => {
    expect(canApproveSchool("pending")).toBe(true);
    expect(canApproveSchool("rejected")).toBe(true);
    expect(canApproveSchool("active")).toBe(false);
    expect(canRejectSchool("pending")).toBe(true);
    expect(canRejectSchool("active")).toBe(false);
    expect(canReopenSchoolReview("active")).toBe(true);
    expect(canReopenSchoolReview("pending")).toBe(false);
  });

  it("shows archived state without losing the underlying approval state", () => {
    expect(getSchoolDisplayStatus("active", new Date())).toBe("archived");
    expect(getSchoolDisplayStatus("pending", null)).toBe("pending");
  });
});
