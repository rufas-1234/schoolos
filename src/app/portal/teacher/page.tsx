import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { BookOpenCheck, CalendarDays, ClipboardCheck, UsersRound } from "lucide-react";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classRooms,
  classRoutines,
  classSections,
  classSubjects,
  examClasses,
  examSubjects,
  examinations,
  schoolBranches,
  staffMembers,
  subjects,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { TeacherPortalShell } from "./teacher-portal-shell";

export const dynamic = "force-dynamic";

const weekdays = new Map([
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
]);

export default async function TeacherPortalPage() {
  const context = await requireSchoolPermission("results.enter");
  const teacherRecords = await db.select({
    id: teachers.id,
    firstName: teachers.firstName,
    lastName: teachers.lastName,
  }).from(teachers)
    .innerJoin(staffMembers, and(
      eq(staffMembers.id, teachers.staffMemberId!),
      eq(staffMembers.schoolId, context.schoolId),
      eq(staffMembers.linkedUserId, context.user.id),
      eq(staffMembers.status, "active"),
    ))
    .where(and(
      eq(teachers.schoolId, context.schoolId),
      eq(teachers.status, "active"),
    ));
  const teacherIds = [...new Set(teacherRecords.map((teacher) => teacher.id))];
  const teacherName = teacherRecords.length
    ? [...new Set(teacherRecords.map((teacher) => `${teacher.firstName} ${teacher.lastName}`))].join(" · ")
    : context.user.name;

  const [assignments, routines, assessments] = teacherIds.length
    ? await Promise.all([
      db.select({
        className: classLevels.name,
        sectionName: classSections.name,
        yearName: academicYears.name,
        branchName: schoolBranches.name,
        subjectName: subjects.name,
        subjectCode: subjects.code,
      }).from(classSubjects)
        .innerJoin(teachers, and(
          eq(teachers.id, classSubjects.teacherId!),
          eq(teachers.schoolId, context.schoolId),
          eq(teachers.status, "active"),
        ))
        .innerJoin(staffMembers, and(
          eq(staffMembers.id, teachers.staffMemberId!),
          eq(staffMembers.schoolId, context.schoolId),
          eq(staffMembers.linkedUserId, context.user.id),
          eq(staffMembers.status, "active"),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSubjects.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
          eq(classLevels.status, "active"),
        ))
        .innerJoin(subjects, and(
          eq(subjects.id, classSubjects.subjectId),
          eq(subjects.schoolId, context.schoolId),
        ))
        .innerJoin(classSections, and(
          eq(classSections.classLevelId, classLevels.id),
          eq(classSections.schoolId, context.schoolId),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, classSections.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ))
        .innerJoin(schoolBranches, and(
          eq(schoolBranches.id, classLevels.branchId),
          eq(schoolBranches.schoolId, context.schoolId),
        ))
        .where(and(
          eq(classSubjects.schoolId, context.schoolId),
          inArray(classSubjects.teacherId, teacherIds),
        ))
        .orderBy(asc(classLevels.name), asc(classSections.name), asc(subjects.name)),
      db.select({
        dayOfWeek: classRoutines.dayOfWeek,
        startsAt: classRoutines.startsAt,
        endsAt: classRoutines.endsAt,
        className: classLevels.name,
        sectionName: classSections.name,
        subjectName: subjects.name,
        roomNumber: classRooms.roomNumber,
      }).from(classRoutines)
        .innerJoin(classSubjects, and(
          eq(classSubjects.id, classRoutines.classSubjectId),
          eq(classSubjects.schoolId, context.schoolId),
        ))
        .innerJoin(teachers, and(
          eq(teachers.id, classSubjects.teacherId!),
          eq(teachers.schoolId, context.schoolId),
          eq(teachers.status, "active"),
        ))
        .innerJoin(staffMembers, and(
          eq(staffMembers.id, teachers.staffMemberId!),
          eq(staffMembers.schoolId, context.schoolId),
          eq(staffMembers.linkedUserId, context.user.id),
          eq(staffMembers.status, "active"),
        ))
        .innerJoin(subjects, and(
          eq(subjects.id, classSubjects.subjectId),
          eq(subjects.schoolId, context.schoolId),
        ))
        .innerJoin(classSections, and(
          eq(classSections.id, classRoutines.classSectionId),
          eq(classSections.schoolId, context.schoolId),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
          eq(classLevels.status, "active"),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, classSections.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ))
        .leftJoin(classRooms, and(
          eq(classRooms.id, classRoutines.classRoomId!),
          eq(classRooms.schoolId, context.schoolId),
        ))
        .where(and(
          eq(classRoutines.schoolId, context.schoolId),
          inArray(classSubjects.teacherId, teacherIds),
        ))
        .orderBy(asc(classRoutines.dayOfWeek), asc(classRoutines.startsAt)),
      db.select({
        examId: examinations.id,
        assessmentId: examSubjects.id,
        examName: examinations.name,
        examStatus: examinations.status,
        assessmentStatus: examSubjects.status,
        examDate: examSubjects.examDate,
        className: classLevels.name,
        subjectName: subjects.name,
        yearName: academicYears.name,
      }).from(examSubjects)
        .innerJoin(classSubjects, and(
          eq(classSubjects.id, examSubjects.classSubjectId),
          eq(classSubjects.schoolId, context.schoolId),
        ))
        .innerJoin(teachers, and(
          eq(teachers.id, classSubjects.teacherId!),
          eq(teachers.schoolId, context.schoolId),
          eq(teachers.status, "active"),
        ))
        .innerJoin(staffMembers, and(
          eq(staffMembers.id, teachers.staffMemberId!),
          eq(staffMembers.schoolId, context.schoolId),
          eq(staffMembers.linkedUserId, context.user.id),
          eq(staffMembers.status, "active"),
        ))
        .innerJoin(examClasses, and(
          eq(examClasses.id, examSubjects.examClassId),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .innerJoin(examinations, and(
          eq(examinations.id, examClasses.examinationId),
          eq(examinations.schoolId, context.schoolId),
          inArray(examinations.status, ["open", "published"]),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, examinations.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, examClasses.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
          eq(classLevels.status, "active"),
        ))
        .innerJoin(subjects, and(
          eq(subjects.id, classSubjects.subjectId),
          eq(subjects.schoolId, context.schoolId),
        ))
        .where(and(
          eq(examSubjects.schoolId, context.schoolId),
          inArray(classSubjects.teacherId, teacherIds),
        ))
        .orderBy(asc(examSubjects.examDate), asc(classLevels.name), asc(subjects.name)),
    ])
    : [[], [], []];

  const uniqueAssignments = [...new Map(assignments.map((assignment) => [
    `${assignment.yearName}:${assignment.className}:${assignment.sectionName}:${assignment.subjectName}`,
    assignment,
  ])).values()];
  const hasTeacherProfile = teacherRecords.length > 0;

  return (
    <TeacherPortalShell schoolName={context.schoolName} teacherName={teacherName}>
      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8">
        <header className="rounded-3xl bg-gradient-to-br from-violet-800 to-indigo-900 p-7 text-white shadow-lg sm:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-200">Your teaching workspace</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Welcome, {teacherName}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-violet-100">
            Your assigned classes, weekly timetable, and examination work are collected here.
          </p>
        </header>

        {!hasTeacherProfile ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <h2 className="font-semibold">Teacher profile not linked</h2>
            <p className="mt-1">
              Ask a school administrator to link your login account to an active staff and teacher record before using teaching assignments.
            </p>
          </section>
        ) : (
          <>
            <section aria-label="Teaching summary" className="grid gap-4 sm:grid-cols-3">
              <SummaryCard icon={UsersRound} label="Class and subject assignments" value={uniqueAssignments.length} />
              <SummaryCard icon={CalendarDays} label="Scheduled lessons this week" value={routines.length} />
              <SummaryCard icon={ClipboardCheck} label="Active exam assessments" value={assessments.length} />
            </section>

            <section id="classes" className="space-y-4">
              <SectionHeading title="My classes" description="Assignments are shown by the actual class section." />
              {uniqueAssignments.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {uniqueAssignments.map((assignment) => (
                    <article
                      key={`${assignment.yearName}-${assignment.className}-${assignment.sectionName}-${assignment.subjectName}`}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                        {assignment.branchName} · {assignment.yearName}
                      </p>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">
                        {assignment.className} · {assignment.sectionName}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">{assignment.subjectName}</p>
                      <p className="mt-2 text-xs text-slate-400">{assignment.subjectCode}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState>There are no subject assignments in an active academic year yet.</EmptyState>
              )}
            </section>

            <section id="assessments" className="space-y-4">
              <SectionHeading title="Examination work" description="Open only the assessments assigned to your teacher account." />
              {assessments.length ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[46rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Examination</th>
                          <th className="px-4 py-3 font-semibold">Class</th>
                          <th className="px-4 py-3 font-semibold">Subject</th>
                          <th className="px-4 py-3 font-semibold">Assessment date</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {assessments.map((assessment) => (
                          <tr key={assessment.assessmentId}>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {assessment.examName}<span className="mt-1 block text-xs font-normal text-slate-500">{assessment.yearName}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{assessment.className}</td>
                            <td className="px-4 py-3 text-slate-700">{assessment.subjectName}</td>
                            <td className="px-4 py-3 text-slate-700">{assessment.examDate}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {assessment.examStatus === "published" ? "Published" : assessment.assessmentStatus.replaceAll("_", " ")}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/admin/examinations/${assessment.examId}/subjects/${assessment.assessmentId}`}
                                className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:text-violet-900"
                              >
                                {assessment.examStatus === "published" ? "View results" : "Open marks"} <BookOpenCheck size={15} aria-hidden="true" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <EmptyState>No open or published examination assessments are assigned to you for the active academic year.</EmptyState>
              )}
            </section>

            <section id="timetable" className="space-y-4">
              <SectionHeading title="My weekly timetable" description="Scheduled lessons for your assigned subjects and active-year sections." />
              {routines.length ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Day</th>
                          <th className="px-4 py-3 font-semibold">Time</th>
                          <th className="px-4 py-3 font-semibold">Class section</th>
                          <th className="px-4 py-3 font-semibold">Subject</th>
                          <th className="px-4 py-3 font-semibold">Room</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {routines.map((routine, index) => (
                          <tr key={`${routine.dayOfWeek}-${routine.startsAt}-${routine.className}-${routine.sectionName}-${routine.subjectName}-${index}`}>
                            <td className="px-4 py-3 font-medium text-slate-900">{weekdays.get(routine.dayOfWeek) ?? "Other"}</td>
                            <td className="px-4 py-3 text-slate-700">{routine.startsAt}–{routine.endsAt}</td>
                            <td className="px-4 py-3 text-slate-700">{routine.className} · {routine.sectionName}</td>
                            <td className="px-4 py-3 text-slate-700">{routine.subjectName}</td>
                            <td className="px-4 py-3 text-slate-700">{routine.roomNumber ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <EmptyState>No timetable periods have been scheduled for your active-year assignments.</EmptyState>
              )}
            </section>
          </>
        )}
      </main>
    </TeacherPortalShell>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
}) {
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="rounded-xl bg-violet-50 p-3 text-violet-700">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span>
        <span className="block text-2xl font-bold text-slate-950">{value}</span>
        <span className="block text-sm text-slate-500">{label}</span>
      </span>
    </article>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </header>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
      {children}
    </p>
  );
}
