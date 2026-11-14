import { isValidDateRange } from "./academic-policy";
import { staffRoles } from "./staff-policy";

export const staffAttendanceStatuses = ["present", "absent", "late", "excused"] as const;
export const staffLeaveRequestStatuses = ["pending", "approved", "rejected"] as const;
export const staffPayrollStatuses = ["recorded", "paid"] as const;
export const staffPayrollFilters = ["all", "recorded", "paid"] as const;
export type StaffRoleFilter = (typeof staffRoles)[number] | "all" | "unassigned";

export function parsePayrollMoneyToMinorUnits(value: string): number | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function calculatePayrollAmounts(
  baseSalary: number,
  allowances: number,
  deductions: number,
): { gross: number; net: number } | null {
  const maxMoneyMinorUnits = 999_999_999_999;
  if (![baseSalary, allowances, deductions].every(Number.isSafeInteger) ||
    baseSalary <= 0 || baseSalary > maxMoneyMinorUnits ||
    allowances < 0 || allowances > maxMoneyMinorUnits ||
    deductions < 0 || deductions > maxMoneyMinorUnits) return null;
  const gross = baseSalary + allowances;
  if (!Number.isSafeInteger(gross) || gross > maxMoneyMinorUnits || deductions > gross) return null;
  return { gross, net: gross - deductions };
}

export function formatPayrollMinorUnits(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError("Payroll amount must be non-negative minor units.");
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

export function parseStaffPayrollFilter(value: string): (typeof staffPayrollFilters)[number] {
  return staffPayrollFilters.find((status) => status === value) ?? "all";
}

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
