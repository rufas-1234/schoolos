import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { academicYears } from "@/db/schema";
import { resolveSchoolAcademicYear, selectedAcademicYearCookieName, type SchoolAcademicYear } from "./academic-year-policy";

export async function getSchoolAcademicYearSelection(schoolId: number) {
  const years = await db
    .select({
      id: academicYears.id,
      name: academicYears.name,
      status: academicYears.status,
      startDate: academicYears.startDate,
      endDate: academicYears.endDate,
    })
    .from(academicYears)
    .where(eq(academicYears.schoolId, schoolId))
    .orderBy(desc(academicYears.startDate), desc(academicYears.id));
  const cookieStore = await cookies();
  const selectedYear = resolveSchoolAcademicYear(
    years,
    cookieStore.get(selectedAcademicYearCookieName)?.value,
  );
  return { years, selectedYear };
}

export async function getSelectedSchoolAcademicYear(years: SchoolAcademicYear[]) {
  const cookieStore = await cookies();
  return resolveSchoolAcademicYear(
    years,
    cookieStore.get(selectedAcademicYearCookieName)?.value,
  );
}

export { type SchoolAcademicYear } from "./academic-year-policy";
