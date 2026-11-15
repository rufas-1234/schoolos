import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classRooms,
  classRoutines,
  classSections,
  classSubjects,
  schoolBranches,
  subjects,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";

type SearchParams = { sectionId?: string | string[] };

function parseSectionId(value: SearchParams["sectionId"]): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

const weekdays = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

export default async function ClassRoutinePrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSchoolPermission(["academics.manage", "school.settings.manage"]);
  const sectionId = parseSectionId((await searchParams).sectionId);
  if (!sectionId) notFound();

  const [section] = await db.select({
    id: classSections.id,
    name: classSections.name,
    className: classLevels.name,
    branchName: schoolBranches.name,
    yearName: academicYears.name,
  }).from(classSections)
    .innerJoin(classLevels, and(
      eq(classSections.classLevelId, classLevels.id),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(schoolBranches, and(
      eq(classLevels.branchId, schoolBranches.id),
      eq(schoolBranches.schoolId, context.schoolId),
    ))
    .innerJoin(academicYears, and(
      eq(classSections.academicYearId, academicYears.id),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .where(and(
      eq(classSections.id, sectionId),
      eq(classSections.schoolId, context.schoolId),
    ))
    .limit(1);
  if (!section) notFound();

  const routines = await db.select({
    dayOfWeek: classRoutines.dayOfWeek,
    startsAt: classRoutines.startsAt,
    endsAt: classRoutines.endsAt,
    subjectName: subjects.name,
    teacherName: teachers.firstName,
    teacherLastName: teachers.lastName,
    roomNumber: classRooms.roomNumber,
  }).from(classRoutines)
    .innerJoin(classSubjects, and(
      eq(classRoutines.classSubjectId, classSubjects.id),
      eq(classSubjects.schoolId, context.schoolId),
    ))
    .innerJoin(subjects, and(
      eq(classSubjects.subjectId, subjects.id),
      eq(subjects.schoolId, context.schoolId),
    ))
    .leftJoin(teachers, and(
      eq(classSubjects.teacherId, teachers.id),
      eq(teachers.schoolId, context.schoolId),
    ))
    .leftJoin(classRooms, and(
      eq(classRoutines.classRoomId, classRooms.id),
      eq(classRooms.schoolId, context.schoolId),
    ))
    .where(and(
      eq(classRoutines.schoolId, context.schoolId),
      eq(classRoutines.classSectionId, section.id),
    ))
    .orderBy(asc(classRoutines.startsAt), asc(classRoutines.dayOfWeek));

  const timeSlots = [...new Map(routines.map((routine) => [
    `${routine.startsAt}-${routine.endsAt}`,
    { startsAt: routine.startsAt, endsAt: routine.endsAt },
  ])).values()].sort((first, second) => first.startsAt.localeCompare(second.startsAt));

  return (
    <main className="print-report-page mx-auto max-w-6xl space-y-6 p-6 text-slate-900 print:max-w-none print:p-0">
      <section className="print-report-content space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 print-report-heading">
          <div>
            <p className="print-report-kicker">{section.branchName} · Class routine</p>
            <h1 className="text-2xl font-bold">{section.className} · {section.name}</h1>
            <p>{section.yearName} · Monday to Friday · {routines.length} scheduled periods</p>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <Link href="/admin/academics?section=routines" className="text-sm font-semibold text-violet-700">
              Back to routines
            </Link>
            <PrintButton label="Print class routine" />
          </div>
        </header>

        <section className="print-report-panel overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          {timeSlots.length > 0 ? (
            <table className="print-report-table w-full min-w-[52rem] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col">Time</th>
                  {weekdays.map((day) => <th key={day.value} scope="col">{day.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((slot) => (
                  <tr key={`${slot.startsAt}-${slot.endsAt}`}>
                    <th scope="row" className="whitespace-nowrap font-semibold">
                      {slot.startsAt}–{slot.endsAt}
                    </th>
                    {weekdays.map((day) => {
                      const routine = routines.find((entry) =>
                        entry.dayOfWeek === day.value &&
                        entry.startsAt === slot.startsAt &&
                        entry.endsAt === slot.endsAt,
                      );
                      return (
                        <td key={day.value}>
                          {routine ? (
                            <>
                              <p className="font-semibold">{routine.subjectName}</p>
                              <p>{routine.teacherName
                                ? `${routine.teacherName} ${routine.teacherLastName}`
                                : "Teacher not assigned"}</p>
                              {routine.roomNumber && <p>Room {routine.roomNumber}</p>}
                            </>
                          ) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-8 text-center text-sm text-slate-600">
              No routine periods are scheduled for this section yet.
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
