import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  classSubjects,
  examClasses,
  examMarkCorrections,
  examMarks,
  examSubjects,
  examTypes,
  examinations,
  schoolBranches,
  staffMembers,
  studentEnrollments,
  students,
  subjects,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  AssignExamClassTeacherForm,
  PrincipalRemarkForm,
  PublishExamClassForm,
  ReviewCorrectionForm,
  ReviewSubjectForm,
  SubjectSettingsForm,
} from "../examination-forms";

export const dynamic = "force-dynamic";

export default async function ExaminationDetailPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.enter", "results.publish"]);
  const { examId: rawId } = await params;
  if (!/^\d+$/.test(rawId)) notFound();
  const examId = Number(rawId);
  const [exam] = await db.select({
    id: examinations.id,
    name: examinations.name,
    examTypeName: examTypes.name,
    branchName: schoolBranches.name,
    examSystem: examinations.examSystem,
    status: examinations.status,
    startDate: examinations.startDate,
    endDate: examinations.endDate,
    yearName: academicYears.name,
    academicYearId: examinations.academicYearId,
    publicId: examinations.publicId,
  }).from(examinations)
    .innerJoin(academicYears, and(
      eq(academicYears.id, examinations.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .leftJoin(examTypes, and(
      eq(examTypes.id, examinations.examTypeId!),
      eq(examTypes.schoolId, context.schoolId),
    ))
    .leftJoin(schoolBranches, eq(schoolBranches.id, examinations.branchId!))
    .where(and(eq(examinations.id, examId), eq(examinations.schoolId, context.schoolId)))
    .limit(1);
  if (!exam) notFound();

  const canConfigure = context.grantedPermissions.includes("examinations.create");
  const canReview = context.grantedPermissions.includes("results.publish");
  const myTeacherRows = context.grantedPermissions.includes("results.enter")
    ? await db.select({ id: teachers.id }).from(teachers)
      .innerJoin(staffMembers, and(
        eq(staffMembers.id, teachers.staffMemberId!),
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.linkedUserId, context.user.id),
        eq(staffMembers.status, "active"),
      ))
      .where(and(eq(teachers.schoolId, context.schoolId), eq(teachers.status, "active")))
    : [];
  const myTeacherIds = myTeacherRows.map((teacher) => teacher.id);
  let assignedIds: number[] | null = null;
  if (!canConfigure && !canReview) {
    const assigned = await db.select({ id: examSubjects.id }).from(examSubjects)
      .innerJoin(examClasses, eq(examClasses.id, examSubjects.examClassId))
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
      .where(and(eq(examClasses.examinationId, exam.id), eq(examClasses.schoolId, context.schoolId)));
    const appointedClassSubjects = myTeacherIds.length
      ? await db.select({ id: examSubjects.id }).from(examSubjects)
        .innerJoin(examClasses, and(
          eq(examClasses.id, examSubjects.examClassId),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .where(and(
          eq(examClasses.examinationId, exam.id),
          inArray(examClasses.classTeacherId, myTeacherIds),
          eq(examSubjects.schoolId, context.schoolId),
        ))
      : [];
    assignedIds = [...new Set([...assigned.map((row) => row.id), ...appointedClassSubjects.map((row) => row.id)])];
    if (!assignedIds.length) notFound();
  }
  const allSubjects = await db.select({
    id: examSubjects.id,
    publicId: examSubjects.publicId,
    examClassId: examClasses.id,
    classLevelId: classLevels.id,
    className: classLevels.name,
    subjectName: subjects.name,
    subjectCode: subjects.code,
    teacherId: classSubjects.teacherId,
    teacherFirstName: teachers.firstName,
    teacherLastName: teachers.lastName,
    examDate: examSubjects.examDate,
    maxMarks: examSubjects.maxMarks,
    weight: examSubjects.weight,
    status: examSubjects.status,
    reviewNote: examSubjects.reviewNote,
  }).from(examSubjects)
    .innerJoin(examClasses, and(
      eq(examClasses.id, examSubjects.examClassId),
      eq(examClasses.schoolId, context.schoolId),
    ))
    .innerJoin(classLevels, and(eq(classLevels.id, examClasses.classLevelId), eq(classLevels.schoolId, context.schoolId)))
    .innerJoin(classSubjects, and(eq(classSubjects.id, examSubjects.classSubjectId), eq(classSubjects.schoolId, context.schoolId)))
    .innerJoin(subjects, and(eq(subjects.id, classSubjects.subjectId), eq(subjects.schoolId, context.schoolId)))
    .leftJoin(teachers, and(eq(teachers.id, classSubjects.teacherId!), eq(teachers.schoolId, context.schoolId)))
    .where(and(eq(examSubjects.schoolId, context.schoolId), eq(examClasses.examinationId, exam.id)))
    .orderBy(asc(classLevels.name), asc(subjects.name));
  const visibleSubjects = assignedIds ? allSubjects.filter((subject) => assignedIds?.includes(subject.id)) : allSubjects;
  const progressMarks = allSubjects.length
    ? await db.select({
      examSubjectId: examMarks.examSubjectId,
      marks: examMarks.marks,
    }).from(examMarks).where(and(
      eq(examMarks.schoolId, context.schoolId),
      inArray(examMarks.examSubjectId, allSubjects.map((subject) => subject.id)),
    ))
    : [];
  const markProgressBySubject = new Map<number, { entered: number; total: number }>();
  for (const mark of progressMarks) {
    const progress = markProgressBySubject.get(mark.examSubjectId) ?? { entered: 0, total: 0 };
    progress.total += 1;
    if (mark.marks !== null) progress.entered += 1;
    markProgressBySubject.set(mark.examSubjectId, progress);
  }
  const completeSubjects = allSubjects.filter((subject) => {
    const progress = markProgressBySubject.get(subject.id);
    return !!progress && progress.total > 0 && progress.entered === progress.total;
  }).length;
  const canPreviewReports = exam.name.startsWith("TEST DATA - ") && (canConfigure || canReview);
  const reportsReady = exam.status === "published" || canPreviewReports;
  const classRows = await db.select({
    id: examClasses.id,
    classLevelId: classLevels.id,
    className: classLevels.name,
    principalRemark: examClasses.principalRemark,
    classTeacherId: examClasses.classTeacherId,
    classTeacherFirstName: teachers.firstName,
    classTeacherLastName: teachers.lastName,
  }).from(examClasses).innerJoin(classLevels, and(
    eq(classLevels.id, examClasses.classLevelId),
    eq(classLevels.schoolId, context.schoolId),
  )).leftJoin(teachers, and(
    eq(teachers.id, examClasses.classTeacherId!),
    eq(teachers.schoolId, context.schoolId),
  )).where(and(eq(examClasses.schoolId, context.schoolId), eq(examClasses.examinationId, exam.id)))
    .orderBy(asc(classLevels.name));
  const classTeacherOptions = canConfigure
    ? await db.select({
      classLevelId: classSections.classLevelId,
      id: teachers.id,
      name: teachers.firstName,
      lastName: teachers.lastName,
    }).from(classSections).innerJoin(teachers, and(
      eq(teachers.id, classSections.classTeacherId!),
      eq(teachers.schoolId, context.schoolId),
      eq(teachers.status, "active"),
    )).where(and(
      eq(classSections.schoolId, context.schoolId),
      eq(classSections.academicYearId, exam.academicYearId),
      inArray(classSections.classLevelId, classRows.map((classRow) => classRow.classLevelId)),
      eq(teachers.schoolId, context.schoolId),
    )).orderBy(asc(teachers.firstName), asc(teachers.lastName))
    : [];
  const pendingCorrections = canReview
    ? await db.select({
      id: examMarkCorrections.id,
      reason: examMarkCorrections.reason,
      requestedMarks: examMarkCorrections.requestedMarks,
      previousMarks: examMarkCorrections.previousMarks,
      studentName: students.firstName,
      studentLastName: students.lastName,
      subjectName: subjects.name,
      admissionNumber: students.admissionNumber,
    }).from(examMarkCorrections)
      .innerJoin(examMarks, eq(examMarks.id, examMarkCorrections.examMarkId))
      .innerJoin(studentEnrollments, eq(studentEnrollments.id, examMarks.enrollmentId))
      .innerJoin(students, and(eq(students.id, studentEnrollments.studentId), eq(students.schoolId, context.schoolId)))
      .innerJoin(examSubjects, eq(examSubjects.id, examMarks.examSubjectId))
      .innerJoin(classSubjects, eq(classSubjects.id, examSubjects.classSubjectId))
      .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
      .innerJoin(examClasses, eq(examClasses.id, examSubjects.examClassId))
      .where(and(
        eq(examMarkCorrections.schoolId, context.schoolId),
        eq(examMarkCorrections.status, "pending"),
        eq(examClasses.examinationId, exam.id),
      ))
    : [];
  const overallStatus = exam.status === "published" ? "Published — marks locked" : "Open for marks entry";

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/examinations" className="text-sm font-semibold text-violet-700">← Examinations</Link>
          <p className="mt-4 text-sm font-semibold text-violet-700">{context.schoolName} · {exam.yearName}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{exam.name}</h1>
          <p className="mt-2 text-sm text-slate-600">{exam.examTypeName ? `${exam.examTypeName} · ` : ""}{exam.branchName ?? "All branches"} · {exam.examSystem === "multi" ? "Multi Exam" : "Single Exam"} · {exam.startDate} – {exam.endDate} · {overallStatus}</p>
        </div>
      </header>

      <section aria-label="Exam workflow" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { number: "1", title: "Check setup", detail: `${classRows.length} classes · ${allSubjects.length} subjects`, href: "/admin/examinations?section=setup", done: true },
          { number: "2", title: "Enter marks", detail: `${completeSubjects} of ${allSubjects.length} subject rosters complete`, href: "/admin/examinations?section=marks&examId=" + exam.id, done: completeSubjects === allSubjects.length && allSubjects.length > 0 },
          { number: "3", title: "Review & publish", detail: `${allSubjects.filter((subject) => subject.status === "published").length} of ${allSubjects.length} assessments published by their class teachers`, href: canReview ? "#publication-checklist" : `/admin/examinations?section=marks&examId=${exam.id}`, done: exam.status === "published" },
          { number: "4", title: "Generate reports", detail: exam.status === "published" ? "A4 marksheets and individual or bulk progress cards are ready" : canPreviewReports ? "Print a clearly marked test preview" : "Reports unlock after results are published", href: reportsReady && classRows[0] ? `/admin/examinations/report-center/progress-card?examId=${exam.id}&classId=${classRows[0].id}` : null, done: exam.status === "published" },
        ].map((step) => (
          step.href ? (
            <Link key={step.number} href={step.href} className={`rounded-xl border p-4 ${step.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Step {step.number}</p>
              <h2 className="mt-1 font-semibold text-slate-950">{step.title}</h2>
              <p className="mt-1 text-xs text-slate-600">{step.detail}</p>
            </Link>
          ) : (
            <div key={step.number} aria-disabled="true" className="cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-80">
              <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Step {step.number}</p>
              <h2 className="mt-1 font-semibold text-slate-950">{step.title}</h2>
              <p className="mt-1 text-xs text-slate-600">{step.detail}</p>
            </div>
          )
        ))}
      </section>

      {canReview && exam.status === "open" && (
        <section id="publication-checklist" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-bold text-slate-900">Publication checklist</h2>
          <p className="mt-1 text-sm text-slate-600">{allSubjects.filter((subject) => subject.status === "approved").length} of {allSubjects.length} assessments approved. Each assigned class teacher publishes their own class after every subject is approved and complete.</p>
        </section>
      )}

      {canReview && pendingCorrections.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-950">Pending published-mark corrections</h2>
          <div className="mt-3 space-y-3">
            {pendingCorrections.map((correction) => (
              <article key={correction.id} className="rounded-xl border p-4">
                <p className="font-semibold">{correction.studentName} {correction.studentLastName} · {correction.admissionNumber ?? "No admission number"} · {correction.subjectName}</p>
                <p className="mt-1 text-sm text-slate-600">Current {correction.previousMarks} → requested {correction.requestedMarks}. Reason: {correction.reason}</p>
                <ReviewCorrectionForm correctionId={correction.id} />
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-5">
        <h2 id="assessments" className="text-xl font-bold text-slate-950">Classes and assessments</h2>
        {classRows.map((classRow) => {
          const subjectRows = visibleSubjects.filter((subject) => subject.examClassId === classRow.id);
          if (!subjectRows.length) return null;
          const classPublished = subjectRows.every((subject) => subject.status === "published");
          const classApproved = subjectRows.every((subject) => subject.status === "approved");
          const isAssignedClassTeacher = classRow.classTeacherId !== null && myTeacherIds.includes(classRow.classTeacherId);
          return (
            <article key={classRow.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 p-4">
                <h3 className="text-lg font-bold">{classRow.className}</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-slate-500">{subjectRows.length} subjects</span>
                  {(classPublished || canPreviewReports) && (
                    <>
                      <Link href={`/admin/examinations/${exam.id}/reports/${classRow.id}${classPublished ? "" : "?preview=test"}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                        {classPublished ? "Generate class report" : "Preview test report"}
                      </Link>
                      {classPublished && exam.status === "published" && <Link href={`/admin/examinations/report-center/progress-card?examId=${exam.id}&classId=${classRow.id}`} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white">Bulk progress cards</Link>}
                    </>
                  )}
                </div>
              </div>
              <div className="grid gap-3 border-b p-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Publishing class teacher</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {classRow.classTeacherFirstName
                      ? `${classRow.classTeacherFirstName} ${classRow.classTeacherLastName}`
                      : "Not assigned"}
                  </p>
                  {canConfigure && exam.status === "open" && (
                    <AssignExamClassTeacherForm
                      examClassId={classRow.id}
                      classTeacherId={classRow.classTeacherId}
                      teachers={classTeacherOptions.filter((teacher) => teacher.classLevelId === classRow.classLevelId)
                        .map((teacher) => ({ id: teacher.id, name: `${teacher.name} ${teacher.lastName}` }))}
                    />
                  )}
                  {isAssignedClassTeacher && exam.status === "open" && !classPublished && (
                    <div className="mt-3">
                      <PublishExamClassForm examClassId={classRow.id} disabled={!classApproved} />
                      {!classApproved && <p className="mt-2 text-xs text-amber-800">All class subjects must be reviewed and approved first.</p>}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Class publication status</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {classPublished ? "Published — marks are locked." : `${subjectRows.filter((subject) => subject.status === "approved").length} of ${subjectRows.length} subjects approved.`}
                  </p>
                </div>
              </div>
              {canReview && exam.status === "open" && <div className="p-4"><PrincipalRemarkForm examClassId={classRow.id} remark={classRow.principalRemark} /></div>}
              <div className="divide-y">
                {subjectRows.map((subject) => (
                  <div key={subject.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-slate-900">{subject.subjectName} <span className="text-xs font-normal text-slate-500">({subject.subjectCode})</span></h4>
                        <p className="mt-1 text-xs text-slate-500">Teacher: {subject.teacherFirstName ? `${subject.teacherFirstName} ${subject.teacherLastName}` : "Not assigned"} · {subject.examDate} · Maximum {subject.maxMarks} · Weight {subject.weight}</p>
                        <p className="mt-1 text-xs text-slate-500">{markProgressBySubject.get(subject.id)?.entered ?? 0} of {markProgressBySubject.get(subject.id)?.total ?? 0} student marks entered</p>
                        {subject.reviewNote && <p className="mt-1 text-xs text-amber-800">Review note: {subject.reviewNote}</p>}
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${subject.status === "published" || subject.status === "approved" ? "bg-emerald-100 text-emerald-800" : subject.status === "submitted" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{subject.status}</span>
                    </div>
                    {canConfigure && exam.status === "open" && subject.status === "draft" && (
                      <SubjectSettingsForm examSubjectId={subject.id} examDate={subject.examDate} weight={subject.weight} />
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Link href={`/admin/examinations/${exam.id}/subjects/${subject.id}`} className="text-sm font-semibold text-violet-700 hover:text-violet-900">
                        {exam.status === "published" ? "View results & report cards" : "Enter / review marks"}
                      </Link>
                    </div>
                    {canReview && subject.status === "submitted" && exam.status === "open" && <ReviewSubjectForm examSubjectId={subject.id} />}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
        {visibleSubjects.length === 0 && <p className="rounded-2xl border bg-white p-8 text-center text-slate-500">No subject assessments are assigned to your account for this examination.</p>}
      </section>
    </main>
  );
}
