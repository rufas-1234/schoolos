import { isCalendarDate } from "./academic-policy";

export const feeDiscountTypes = ["fixed", "percentage"] as const;
export const feeFineTypes = ["none", "fixed", "percentage"] as const;
export const feePaymentMethods = ["cash", "bank_transfer", "card", "mobile_money", "cheque", "other"] as const;
export const feeInvoiceStatuses = ["unpaid", "partial", "paid"] as const;

export function feeDisplayName(name: string): string {
  const displayName = name.replace(/^(?:demo(?:\s+test)?\s*[-:]\s*)+/i, "").trim();
  return displayName || name;
}

function parseDecimalToMinorUnits(value: string | number): number | null {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}

function percentageOfMinorUnits(amountMinor: number, basisPoints: number): number | null {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) return null;
  const numerator = BigInt(amountMinor) * BigInt(basisPoints);
  const roundedMinorUnits = (numerator + BigInt(5000)) / BigInt(10000);
  const minorUnits = Number(roundedMinorUnits);
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
  value: string | number,
): number | null {
  const valueMinor = parseDecimalToMinorUnits(value);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || valueMinor === null) {
    return null;
  }
  if (discountType === "fixed") {
    return Math.min(amountMinor, valueMinor);
  }
  if (discountType === "percentage" && valueMinor <= 10000) {
    const discount = percentageOfMinorUnits(amountMinor, valueMinor);
    return discount === null ? null : Math.min(amountMinor, discount);
  }
  return null;
}

export function calculateFineMinorUnits(
  amountMinor: number,
  fineType: string,
  value: string | number,
): number | null {
  const valueMinor = parseDecimalToMinorUnits(value);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || valueMinor === null) {
    return null;
  }
  if (fineType === "none") return 0;
  if (fineType === "fixed") {
    return valueMinor;
  }
  if (fineType === "percentage" && valueMinor <= 10000) {
    return percentageOfMinorUnits(amountMinor, valueMinor);
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

export function calculateOutstandingInvoiceBalance(input: {
  amount: string;
  discountAmount: string;
  fineType: string;
  fineValue: string;
  dueDate: string;
  paidMinor: number;
  today: string;
}): number | null {
  const amount = parseMoneyToMinorUnits(input.amount);
  const discount = parseMoneyToMinorUnits(input.discountAmount);
  if (
    amount === null ||
    discount === null ||
    discount > amount ||
    !Number.isSafeInteger(input.paidMinor) ||
    input.paidMinor < 0 ||
    !isCalendarDate(input.dueDate) ||
    !isCalendarDate(input.today)
  ) return null;
  const fine = input.today > input.dueDate
    ? calculateFineMinorUnits(amount - discount, input.fineType, input.fineValue)
    : 0;
  if (fine === null) return null;
  const totalDue = amount - discount + fine;
  if (!Number.isSafeInteger(totalDue)) return null;
  return Math.max(0, totalDue - input.paidMinor);
}

export function isPayDateOnOrAfterDueDate(paidDate: string, dueDate: string): boolean {
  return isCalendarDate(paidDate) && isCalendarDate(dueDate) && paidDate >= dueDate;
}

export function resolveFeeReportDateRange(
  requestedFrom: string | undefined,
  requestedTo: string | undefined,
  today: string,
): { from: string; to: string } {
  const defaultFrom = `${today.slice(0, 7)}-01`;
  let from = requestedFrom && isCalendarDate(requestedFrom) ? requestedFrom : defaultFrom;
  let to = requestedTo && isCalendarDate(requestedTo) ? requestedTo : today;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export function formatFeeReportDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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
