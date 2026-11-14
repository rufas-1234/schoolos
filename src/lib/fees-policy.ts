import { isCalendarDate } from "./academic-policy";

export const feeDiscountTypes = ["fixed", "percentage"] as const;
export const feeFineTypes = ["none", "fixed", "percentage"] as const;
export const feePaymentMethods = ["cash", "bank_transfer", "card", "mobile_money", "cheque", "other"] as const;
export const feeInvoiceStatuses = ["unpaid", "partial", "paid"] as const;

function percentageOfMinorUnits(amountMinor: number, percentage: number): number | null {
  const basisPoints = Math.round(percentage * 100);
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) return null;
  const wholePart = Math.floor(amountMinor / 10000) * basisPoints;
  const remainderPart = Math.round((amountMinor % 10000) * basisPoints / 10000);
  const minorUnits = wholePart + remainderPart;
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}

export function parseMoneyToMinorUnits(value: string): number | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}

export function calculateDiscountMinorUnits(
  amountMinor: number,
  discountType: string,
  value: number,
): number | null {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isFinite(value) || value < 0) {
    return null;
  }
  if (discountType === "fixed") {
    const discount = Math.round(value * 100);
    if (!Number.isSafeInteger(discount)) return null;
    return Math.min(amountMinor, discount);
  }
  if (discountType === "percentage" && value <= 100) {
    const discount = percentageOfMinorUnits(amountMinor, value);
    return discount === null ? null : Math.min(amountMinor, discount);
  }
  return null;
}

export function calculateFineMinorUnits(
  amountMinor: number,
  fineType: string,
  value: number,
): number | null {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isFinite(value) || value < 0) {
    return null;
  }
  if (fineType === "none") return 0;
  if (fineType === "fixed") {
    const fine = Math.round(value * 100);
    return Number.isSafeInteger(fine) ? fine : null;
  }
  if (fineType === "percentage" && value <= 100) {
    return percentageOfMinorUnits(amountMinor, value);
  }
  return null;
}

export function isValidFeeDueDate(dueDate: string): boolean {
  return isCalendarDate(dueDate);
}

export function feeInvoiceStatus(totalMinor: number, paidMinor: number): "unpaid" | "partial" | "paid" | null {
  if (!Number.isSafeInteger(totalMinor) || !Number.isSafeInteger(paidMinor) ||
    totalMinor < 0 || paidMinor < 0 || paidMinor > totalMinor) return null;
  if (paidMinor === totalMinor) return "paid";
  return paidMinor === 0 ? "unpaid" : "partial";
}

export function isPayDateOnOrAfterDueDate(paidDate: string, dueDate: string): boolean {
  return isCalendarDate(paidDate) && isCalendarDate(dueDate) && paidDate >= dueDate;
}

function startOfDayInTimezone(date: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const desiredLocalTime = Date.UTC(year, month - 1, day);
  let timestamp = desiredLocalTime;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
    const displayedLocalTime = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
    );
    const nextTimestamp = timestamp + desiredLocalTime - displayedLocalTime;
    if (nextTimestamp === timestamp) break;
    timestamp = nextTimestamp;
  }
  return new Date(timestamp);
}

export function feePaymentDateRangeInTimezone(
  from: string,
  to: string,
  timezone: string,
): { start: Date; endExclusive: Date } | null {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) return null;
  const nextDay = new Date(`${to}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const endDate = nextDay.toISOString().slice(0, 10);
  return {
    start: startOfDayInTimezone(from, timezone),
    endExclusive: startOfDayInTimezone(endDate, timezone),
  };
}
