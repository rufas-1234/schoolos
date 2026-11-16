const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const academicYearStatuses = ["planned", "active", "archived"] as const;
export type AcademicYearStatus = (typeof academicYearStatuses)[number];

export const enrollmentOperationTypes = [
  "promote",
  "repeat",
  "transfer_in_school",
  "transfer_out",
  "graduate",
] as const;
export type EnrollmentOperationType = (typeof enrollmentOperationTypes)[number];

export function normalizeClassName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isCalendarDate(value: string): boolean {
  const match = datePattern.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function isValidDateRange(startDate: string, endDate: string): boolean {
  return isCalendarDate(startDate) && isCalendarDate(endDate) && startDate <= endDate;
}

export function isValidTimeRange(startsAt: string, endsAt: string): boolean {
  return timePattern.test(startsAt) && timePattern.test(endsAt) && startsAt < endsAt;
}

export function doTimeRangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function doDateRangesOverlap(
  firstStartDate: string,
  firstEndDate: string,
  secondStartDate: string,
  secondEndDate: string,
): boolean {
  return (
    isValidDateRange(firstStartDate, firstEndDate) &&
    isValidDateRange(secondStartDate, secondEndDate) &&
    firstStartDate <= secondEndDate &&
    secondStartDate <= firstEndDate
  );
}

export function isDateRangeWithin(
  startDate: string,
  endDate: string,
  outerStartDate: string,
  outerEndDate: string,
): boolean {
  return (
    isValidDateRange(startDate, endDate) &&
    isValidDateRange(outerStartDate, outerEndDate) &&
    startDate >= outerStartDate &&
    endDate <= outerEndDate
  );
}

export function isValidOptionalDateRange(
  startDate: string | null,
  endDate: string | null,
  outerStartDate: string,
  outerEndDate: string,
): boolean {
  if (startDate === null && endDate === null) return true;
  if (startDate === null || endDate === null) return false;
  return isDateRangeWithin(startDate, endDate, outerStartDate, outerEndDate);
}

export function canTransitionAcademicYear(
  current: string,
  next: AcademicYearStatus,
): boolean {
  if (!academicYearStatuses.some((status) => status === current)) return false;
  if (current === "archived") return false;
  if (current === next) return false;
  return next === "active" || next === "archived";
}

export function isValidEnrollmentOperation(input: {
  operation: EnrollmentOperationType;
  sourceYearStartDate: string;
  targetYearStartDate?: string;
  sourceClassLevelId: number;
  targetClassLevelId?: number;
  sourceSectionId: number;
  targetSectionId?: number;
}): boolean {
  if (input.operation === "transfer_out" || input.operation === "graduate") {
    return input.targetYearStartDate === undefined && input.targetSectionId === undefined;
  }

  if (
    input.targetYearStartDate === undefined ||
    input.targetSectionId === undefined ||
    input.targetSectionId === input.sourceSectionId
  ) {
    return false;
  }

  if (input.operation === "transfer_in_school") {
    return (
      input.targetYearStartDate === input.sourceYearStartDate &&
      input.targetClassLevelId !== undefined
    );
  }

  if (input.targetYearStartDate <= input.sourceYearStartDate) return false;

  if (input.operation === "repeat") {
    return input.targetClassLevelId === input.sourceClassLevelId;
  }

  if (input.operation === "promote") {
    return (
      input.targetClassLevelId !== undefined &&
      input.targetClassLevelId !== input.sourceClassLevelId
    );
  }

  return false;
}
