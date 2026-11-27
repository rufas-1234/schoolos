import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { academicHolidays, academicTerms, academicYears, examinations } from "@/db/schema";

export type SchoolCalendarEvent = {
  id: string;
  title: string;
  type: "term" | "exam-period" | "holiday" | "examination";
  startDate: string;
  endDate: string;
  academicYearId: number;
  academicYearName: string;
  href: string;
};

export async function getSchoolCalendarEvents(schoolId: number, academicYearId?: number): Promise<SchoolCalendarEvent[]> {
  const [terms, holidays, exams] = await Promise.all([
    db.select({
      id: academicTerms.id,
      yearId: academicTerms.academicYearId,
      yearName: academicYears.name,
      name: academicTerms.name,
      startDate: academicTerms.startDate,
      endDate: academicTerms.endDate,
      examStartDate: academicTerms.examStartDate,
      examEndDate: academicTerms.examEndDate,
    }).from(academicTerms)
      .innerJoin(academicYears, and(eq(academicYears.id, academicTerms.academicYearId), eq(academicYears.schoolId, schoolId)))
      .where(and(eq(academicTerms.schoolId, schoolId), ...(academicYearId ? [eq(academicTerms.academicYearId, academicYearId)] : [])))
      .orderBy(asc(academicTerms.startDate)).limit(500),
    db.select({
      id: academicHolidays.id,
      yearId: academicHolidays.academicYearId,
      yearName: academicYears.name,
      name: academicHolidays.name,
      startDate: academicHolidays.startDate,
      endDate: academicHolidays.endDate,
    }).from(academicHolidays)
      .innerJoin(academicYears, and(eq(academicYears.id, academicHolidays.academicYearId), eq(academicYears.schoolId, schoolId)))
      .where(and(eq(academicHolidays.schoolId, schoolId), ...(academicYearId ? [eq(academicHolidays.academicYearId, academicYearId)] : [])))
      .orderBy(asc(academicHolidays.startDate)).limit(500),
    db.select({
      id: examinations.id,
      yearId: examinations.academicYearId,
      yearName: academicYears.name,
      name: examinations.name,
      startDate: examinations.startDate,
      endDate: examinations.endDate,
    }).from(examinations)
      .innerJoin(academicYears, and(eq(academicYears.id, examinations.academicYearId), eq(academicYears.schoolId, schoolId)))
      .where(and(eq(examinations.schoolId, schoolId), ...(academicYearId ? [eq(examinations.academicYearId, academicYearId)] : [])))
      .orderBy(asc(examinations.startDate)).limit(500),
  ]);

  const events: SchoolCalendarEvent[] = [];
  for (const term of terms) {
    events.push({
      id: `term-${term.id}`,
      title: term.name,
      type: "term",
      startDate: term.startDate,
      endDate: term.endDate,
      academicYearId: term.yearId,
      academicYearName: term.yearName,
      href: "/admin/academics?section=terms",
    });
    if (term.examStartDate && term.examEndDate) events.push({
      id: `term-exam-${term.id}`,
      title: `${term.name} exam period`,
      type: "exam-period",
      startDate: term.examStartDate,
      endDate: term.examEndDate,
      academicYearId: term.yearId,
      academicYearName: term.yearName,
      href: "/admin/academics?section=terms",
    });
  }
  events.push(...holidays.map((holiday): SchoolCalendarEvent => ({
    id: `holiday-${holiday.id}`,
    title: holiday.name,
    type: "holiday",
    startDate: holiday.startDate,
    endDate: holiday.endDate,
    academicYearId: holiday.yearId,
    academicYearName: holiday.yearName,
    href: "/admin/academics?section=holidays",
  })));
  events.push(...exams.map((exam): SchoolCalendarEvent => ({
    id: `examination-${exam.id}`,
    title: exam.name,
    type: "examination",
    startDate: exam.startDate,
    endDate: exam.endDate,
    academicYearId: exam.yearId,
    academicYearName: exam.yearName,
    href: "/admin/examinations",
  })));
  return events.sort((first, second) => first.startDate.localeCompare(second.startDate) || first.title.localeCompare(second.title));
}
