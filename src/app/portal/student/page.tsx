import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import {
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
} from "lucide-react";
import { db } from "@/db";
import {
  classRooms,
  classRoutines,
  academicYears,
  classLevels,
  classSections,
  classSubjects,
  examClasses,
  examMarks,
  examSubjects,
  examinations,
  studentAttendance,
  studentEnrollments,
  students,
  subjects,
  userStudentLinks,
} from "@/db/schema";
import { requireSchoolMember } from "@/lib/access-control";
import { PortalShell } from "@/components/portal-shell";

export const dynamic = "force-dynamic";

export default async function StudentPortalPage() {
  const context = await requireSchoolMember();
  const linkedStudentRecords = await db.select({ studentId: userStudentLinks.studentId })
    .from(userStudentLinks)
    .where(and(
      eq(userStudentLinks.schoolId, context.schoolId),
      eq(userStudentLinks.userId, context.user.id),
      eq(userStudentLinks.accessType, "student"),
    ));
  const linkedStudentIds = linkedStudentRecords.map(({ studentId }) => studentId);
  const linkedStudents = await db.select({
    id: students.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    email: students.email,
    status: students.status,
  }).from(students)
    .where(and(
      eq(students.schoolId, context.schoolId),
      inArray(students.status, ["admitted", "active"]),
      linkedStudentIds.length
        ? or(eq(students.email, context.user.email), inArray(students.id, linkedStudentIds))
        : eq(students.email, context.user.email),
    ));
  const studentIds = linkedStudents.map((student) => student.id);
  const [enrollments, attendance, results] = studentIds.length
    ? await Promise.all([
      db.select({
        studentId: studentEnrollments.studentId,
        classSectionId: studentEnrollments.classSectionId,
        className: classLevels.name,
        sectionName: classSections.name,
        yearName: academicYears.name,
      }).from(studentEnrollments)
        .innerJoin(classSections, and(
          eq(classSections.id, studentEnrollments.classSectionId),
          eq(classSections.schoolId, context.schoolId),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, studentEnrollments.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ))
        .where(and(
          eq(studentEnrollments.schoolId, context.schoolId),
          inArray(studentEnrollments.studentId, studentIds),
          inArray(studentEnrollments.status, ["pending", "enrolled"]),
        ))
        .orderBy(desc(academicYears.startDate)),
      db.select({
        studentId: studentAttendance.studentId,
        attendanceDate: studentAttendance.attendanceDate,
        status: studentAttendance.status,
      }).from(studentAttendance)
        .where(and(
          eq(studentAttendance.schoolId, context.schoolId),
          inArray(studentAttendance.studentId, studentIds),
        ))
        .orderBy(desc(studentAttendance.attendanceDate))
        .limit(40),
      db.select({
        studentId: studentEnrollments.studentId,
        examName: examinations.name,
        subjectName: subjects.name,
        marks: examMarks.marks,
        maxMarks: examSubjects.maxMarks,
        examDate: examSubjects.examDate,
      }).from(examMarks)
        .innerJoin(studentEnrollments, and(
          eq(studentEnrollments.id, examMarks.enrollmentId),
          eq(studentEnrollments.schoolId, context.schoolId),
        ))
        .innerJoin(examSubjects, and(
          eq(examSubjects.id, examMarks.examSubjectId),
          eq(examSubjects.schoolId, context.schoolId),
          eq(examSubjects.status, "published"),
        ))
        .innerJoin(examClasses, and(
          eq(examClasses.id, examSubjects.examClassId),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .innerJoin(examinations, and(
          eq(examinations.id, examClasses.examinationId),
          eq(examinations.schoolId, context.schoolId),
          eq(examinations.status, "published"),
        ))
        .innerJoin(classSubjects, and(
          eq(classSubjects.id, examSubjects.classSubjectId),
          eq(classSubjects.schoolId, context.schoolId),
        ))
        .innerJoin(subjects, and(
          eq(subjects.id, classSubjects.subjectId),
          eq(subjects.schoolId, context.schoolId),
        ))
        .where(and(
          eq(examMarks.schoolId, context.schoolId),
          inArray(studentEnrollments.studentId, studentIds),
          isNotNull(examMarks.marks),
        ))
        .orderBy(desc(examSubjects.examDate))
        .limit(60),
    ])
    : [[], [], []];
  const newestEnrollmentByStudent = new Map<number, (typeof enrollments)[number]>();
  for (const enrollment of enrollments) {
    if (!newestEnrollmentByStudent.has(enrollment.studentId)) {
      newestEnrollmentByStudent.set(enrollment.studentId, enrollment);
    }
  }
  const currentEnrollments = [...newestEnrollmentByStudent.values()];
  const currentSectionIds = [...new Set(currentEnrollments.map((enrollment) => enrollment.classSectionId))];
  const timetable = currentSectionIds.length
    ? await db.select({
      classSectionId: classRoutines.classSectionId,
      dayOfWeek: classRoutines.dayOfWeek,
      startsAt: classRoutines.startsAt,
      endsAt: classRoutines.endsAt,
      subjectName: subjects.name,
      roomNumber: classRooms.roomNumber,
    }).from(classRoutines)
      .innerJoin(classSubjects, and(
        eq(classSubjects.id, classRoutines.classSubjectId),
        eq(classSubjects.schoolId, context.schoolId),
      ))
      .innerJoin(subjects, and(
        eq(subjects.id, classSubjects.subjectId),
        eq(subjects.schoolId, context.schoolId),
      ))
      .leftJoin(classRooms, and(
        eq(classRooms.id, classRoutines.classRoomId!),
        eq(classRooms.schoolId, context.schoolId),
      ))
      .where(and(
        eq(classRoutines.schoolId, context.schoolId),
        inArray(classRoutines.classSectionId, currentSectionIds),
      ))
      .orderBy(classRoutines.dayOfWeek, classRoutines.startsAt)
    : [];
  const weekdayNames = new Map([
    [1, "Monday"],
    [2, "Tuesday"],
    [3, "Wednesday"],
    [4, "Thursday"],
    [5, "Friday"],
  ]);

  return (
    <PortalShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      userName={context.user.name}
      portalLabel="Student Portal"
      navigation={[
        { href: "/portal/student", label: "Overview", icon: LayoutDashboard },
        { href: "#learning", label: "My learning", icon: GraduationCap },
        { href: "#timetable", label: "Class timetable", icon: CalendarDays },
        { href: "#results", label: "Exam results", icon: BookOpenCheck },
        { href: "#attendance", label: "Attendance", icon: CalendarDays },
      ]}
    >
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8 lg:px-8">
        <header className="rounded-3xl bg-gradient-to-br from-violet-800 to-indigo-900 p-6 text-white shadow-lg sm:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-200">Your learning workspace</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Welcome, {context.user.name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-violet-100">
            View your current class, weekly timetable, published exam results, and attendance recorded by your school.
          </p>
        </header>

        {linkedStudents.length === 0 ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <h2 className="font-semibold">Student account not linked</h2>
            <p className="mt-1 leading-6">
              This account is not matched to an active student record. Ask the school administrator to use this
              account email on your student profile.
            </p>
          </section>
        ) : (
          <>
            <section aria-label="Student summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={GraduationCap} label="Student profiles" value={linkedStudents.length} />
              <SummaryCard icon={CalendarDays} label="Weekly lessons" value={timetable.length} />
              <SummaryCard icon={ClipboardCheck} label="Published subject results" value={results.length} />
              <SummaryCard icon={CalendarDays} label="Attendance records" value={attendance.length} />
            </section>

            <section id="learning" className="space-y-4">
              <SectionHeading title="My learning" description="Your current active-year class placement." />
              <div className="grid gap-4 lg:grid-cols-2">
                {linkedStudents.map((student) => {
                  const enrollment = newestEnrollmentByStudent.get(student.id);
                  return (
                    <article key={student.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                        {student.admissionNumber ? `Admission no. ${student.admissionNumber}` : "Student profile"}
                      </p>
                      <h2 className="mt-2 text-xl font-bold text-slate-950">{student.firstName} {student.lastName}</h2>
                      <p className="mt-2 text-sm text-slate-600">
                        {enrollment
                          ? `${enrollment.className} · ${enrollment.sectionName} · ${enrollment.yearName}`
                          : "No active-year class placement is available yet."}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>

            <section id="timetable" className="space-y-4">
              <SectionHeading title="Class timetable" description="Weekly lesson times for your current class section." />
              {timetable.length ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[35rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Day</th>
                          <th className="px-4 py-3 font-semibold">Time</th>
                          <th className="px-4 py-3 font-semibold">Subject</th>
                          <th className="px-4 py-3 font-semibold">Room</th>
                          {linkedStudents.length > 1 && <th className="px-4 py-3 font-semibold">Student</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {timetable.map((lesson, index) => {
                          const student = currentEnrollments.find(
                            (enrollment) => enrollment.classSectionId === lesson.classSectionId,
                          );
                          const studentProfile = linkedStudents.find((item) => item.id === student?.studentId);
                          return (
                            <tr key={`${lesson.classSectionId}-${lesson.dayOfWeek}-${lesson.startsAt}-${lesson.subjectName}-${index}`}>
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {weekdayNames.get(lesson.dayOfWeek) ?? `Day ${lesson.dayOfWeek}`}
                              </td>
                              <td className="px-4 py-3 text-slate-700">{lesson.startsAt}–{lesson.endsAt}</td>
                              <td className="px-4 py-3 text-slate-700">{lesson.subjectName}</td>
                              <td className="px-4 py-3 text-slate-700">{lesson.roomNumber ?? "Not assigned"}</td>
                              {linkedStudents.length > 1 && (
                                <td className="px-4 py-3 text-slate-700">
                                  {studentProfile ? `${studentProfile.firstName} ${studentProfile.lastName}` : "—"}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <EmptyState>No timetable has been scheduled for your current class yet.</EmptyState>
              )}
            </section>

            <section id="results" className="space-y-4">
              <SectionHeading title="Published exam results" description="Only results published by the school are shown." />
              {results.length ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[38rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Examination</th>
                          <th className="px-4 py-3 font-semibold">Subject</th>
                          <th className="px-4 py-3 font-semibold">Marks</th>
                          <th className="px-4 py-3 font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {results.map((result, index) => {
                          const student = linkedStudents.find((item) => item.id === result.studentId);
                          return (
                            <tr key={`${result.examName}-${result.subjectName}-${result.examDate}-${result.studentId}-${index}`}>
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {result.examName}
                                {linkedStudents.length > 1 && student && <span className="mt-1 block text-xs font-normal text-slate-500">{student.firstName} {student.lastName}</span>}
                              </td>
                              <td className="px-4 py-3 text-slate-700">{result.subjectName}</td>
                              <td className="px-4 py-3 font-semibold text-slate-800">{result.marks} / {result.maxMarks}</td>
                              <td className="px-4 py-3 text-slate-700">{result.examDate}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <EmptyState>No published exam results are available yet.</EmptyState>
              )}
            </section>

            <section id="attendance" className="space-y-4">
              <SectionHeading title="Attendance" description="Recent attendance records entered by the school." />
              {attendance.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {attendance.map((record, index) => {
                    const student = linkedStudents.find((item) => item.id === record.studentId);
                    return (
                      <article key={`${record.studentId}-${record.attendanceDate}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="font-semibold text-slate-900">{record.attendanceDate}</p>
                        <p className="mt-1 text-sm capitalize text-slate-600">{record.status.replaceAll("_", " ")}</p>
                        {linkedStudents.length > 1 && student && <p className="mt-1 text-xs text-slate-500">{student.firstName} {student.lastName}</p>}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState>No attendance records have been entered yet.</EmptyState>
              )}
            </section>
          </>
        )}
      </main>
    </PortalShell>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof GraduationCap;
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
