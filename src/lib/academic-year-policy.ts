export const selectedAcademicYearCookieName = "schoolos-academic-year";

export type SchoolAcademicYear = {
  id: number;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
};

export function resolveSchoolAcademicYear(
  years: SchoolAcademicYear[],
  storedId: string | undefined,
): SchoolAcademicYear | null {
  const parsedId = storedId && /^\d+$/.test(storedId) ? Number(storedId) : NaN;
  const requestedYear = Number.isSafeInteger(parsedId)
    ? years.find((year) => year.id === parsedId)
    : undefined;
  return requestedYear ?? years.find((year) => year.status === "active") ?? years[0] ?? null;
}
