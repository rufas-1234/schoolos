import { describe, expect, it } from "vitest";
import { attendanceStatuses, isAttendanceStatus } from "./attendance-policy";

describe("attendance policy", () => {
  it("accepts only supported attendance states", () => {
    for (const status of attendanceStatuses) {
      expect(isAttendanceStatus(status)).toBe(true);
    }

    expect(isAttendanceStatus("unexcused")).toBe(false);
    expect(isAttendanceStatus("")).toBe(false);
  });
});
