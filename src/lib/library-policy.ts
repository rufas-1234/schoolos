export const DEFAULT_LIBRARY_LOAN_DAYS = 14;

function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

export function getDefaultLoanDueDate(issueDate: string): string | null {
  const date = parseCalendarDate(issueDate);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + DEFAULT_LIBRARY_LOAN_DAYS);
  return date.toISOString().slice(0, 10);
}

export function isFutureLibraryDueDate(dueDate: string, today: string): boolean {
  return parseCalendarDate(dueDate) !== null &&
    parseCalendarDate(today) !== null &&
    dueDate > today;
}

export function calculateLibraryAvailability(
  totalCopies: number,
  availableCopies: number,
  requestedTotal: number,
): number | null {
  if (
    !Number.isSafeInteger(totalCopies) ||
    !Number.isSafeInteger(availableCopies) ||
    !Number.isSafeInteger(requestedTotal) ||
    totalCopies < 1 ||
    availableCopies < 0 ||
    availableCopies > totalCopies ||
    requestedTotal < 1
  ) return null;

  const onLoan = totalCopies - availableCopies;
  return requestedTotal < onLoan ? null : requestedTotal - onLoan;
}

