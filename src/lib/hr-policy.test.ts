import { describe, expect, it } from "vitest";
import {
  canReviewLeaveRequest,
  fitsLeaveEntitlement,
  inclusiveCalendarDays,
  staffAttendanceStatuses,
  staffLeaveRequestStatuses,
  staffPayrollStatuses,
} from "./hr-policy";

describe("human resources policies", () => {
  it("defines attendance, leave, and payroll states", () => {
    expect(staffAttendanceStatuses).toEqual(["present", "absent", "late", "excused"]);
    expect(staffLeaveRequestStatuses).toEqual(["pending", "approved", "rejected"]);
    expect(staffPayrollStatuses).toEqual(["recorded", "paid"]);
  });

  it("counts inclusive calendar days and rejects invalid ranges", () => {
    expect(inclusiveCalendarDays("2024-02-28", "2024-03-01")).toBe(3);
    expect(inclusiveCalendarDays("2024-03-01", "2024-03-01")).toBe(1);
    expect(inclusiveCalendarDays("2024-03-02", "2024-03-01")).toBeNull();
    expect(inclusiveCalendarDays("2023-02-29", "2023-03-01")).toBeNull();
  });

  it("keeps leave reservations within assigned entitlements", () => {
    expect(fitsLeaveEntitlement(10, 4, 6)).toBe(true);
    expect(fitsLeaveEntitlement(10, 4, 6.01)).toBe(false);
    expect(fitsLeaveEntitlement(10, 4, 0)).toBe(false);
    expect(fitsLeaveEntitlement(Number.NaN, 0, 1)).toBe(false);
  });

  it("allows review decisions only for pending leave requests", () => {
    expect(canReviewLeaveRequest("pending")).toBe(true);
    expect(canReviewLeaveRequest("approved")).toBe(false);
    expect(canReviewLeaveRequest("rejected")).toBe(false);
  });
});
