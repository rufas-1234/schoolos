import { isValidDateRange } from "./academic-policy";
import { staffRoles } from "./staff-policy";

export const staffAttendanceStatuses = ["present", "absent", "late", "excused"] as const;
export const staffLeaveRequestStatuses = ["pending", "approved", "rejected"] as const;
export const staffPayrollStatuses = ["recorded", "paid"] as const;
export type StaffRoleFilter = (typeof staffRoles)[number] | "all" | "unassigned";

export function parseStaffRoleFilter(value: string): StaffRoleFilter {
  if (value === "unassigned") return value;
  return staffRoles.find((role) => role === value) ?? "all";
}

export function inclusiveCalendarDays(startDate: string, endDate: string): number | null {
  if (!isValidDateRange(startDate, endDate)) return null;
  return Math.floor(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  ) + 1;
}

export function isValidStaffReportRange(startDate: string, endDate: string): boolean {
  const days = inclusiveCalendarDays(startDate, endDate);
  return days !== null && days <= 367;
}

export function fitsLeaveEntitlement(
  entitlementDays: number,
  reservedDays: number,
  requestedDays: number,
): boolean {
  return Number.isFinite(entitlementDays) &&
    Number.isFinite(reservedDays) &&
    Number.isFinite(requestedDays) &&
    entitlementDays >= 0 &&
    reservedDays >= 0 &&
    requestedDays > 0 &&
    reservedDays + requestedDays <= entitlementDays;
}

export function canReviewLeaveRequest(current: string): boolean {
  return current === "pending";
}
