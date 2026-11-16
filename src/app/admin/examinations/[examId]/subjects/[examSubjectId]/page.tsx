import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  classSubjects,
  classSections,
  classLevels,
  examClasses,
  examAttendance,
  examComponentMarks,
  examComponents,
  examGradeBands,
  examGradingScales,
  examMarkAudits,
  examMarkCorrections,
  examMarks,
  examStudentRemarks,
  examSubjects,
  examinations,
  studentEnrollments,
  students,
  subjects,
  staffMembers,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { PrintButton } from "@/components/print-button";
import {
  ClassTeacherRemarkForm,
  CorrectionRequestForm,
  ReopenApprovedSubjectForm,
  SearchableStudentItems,
  SaveMarksForm,
  SubmitSubjectForm,
} from "../../../examination-forms";

export const dynamic = "force-dynamic";

export default async function SubjectMarksPage({
  params,
}: {
  params: Promise<{ examId: string; examSubjectId: string }>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.enter", "results.publish"]);
  const { examId: rawExamId, examSubjectId: rawSubjectId } = await params;
  if (!/^\d+$/.test(rawExamId) || !/^\d+$/.test(rawSubjectId)) notFound();
  const examId = Number(rawExamId);
  const subjectId = Number(rawSubjectId);
  const [subject] = await db.select({
    id: examSubjects.id,
    publicId: examSubjects.publicId,
    examClassId: examClasses.id,
    className: classLevels.name,
    subjectName: subjects.name,
    subjectCode: subjects.code,
    examName: examinations.name,
    examDate: examSubjects.examDate,
    maxMarks: examSubjects.maxMarks,
    weight: examSubjects.weight,
    status: examSubjects.status,
    examStatus: examinations.status,
    examPublicId: examinations.publicId,
    yearId: examinations.academicYearId,
    branchId: examinations.branchId,
    examSystem: examinations.examSystem,
    scaleId: examGradingScales.id,
    scaleName: examGradingScales.name,
    classLevelId: examClasses.classLevelId,
  }).from(examSubjects)
    .innerJoin(examClasses, and(eq(examClasses.id, examSubjects.examClassId), eq(examClasses.schoolId, context.schoolId)))
    .innerJoin(examinations, and(eq(examinations.id, examClasses.examinationId), eq(examinations.schoolId, context.schoolId)))
    .innerJoin(classLevels, and(eq(classLevels.id, examClasses.classLevelId), eq(classLevels.schoolId, context.schoolId)))
    .innerJoin(classSubjects, and(eq(classSubjects.id, examSubjects.classSubjectId), eq(classSubjects.schoolId, context.schoolId)))
    .innerJoin(subjects, and(eq(subjects.id, classSubjects.subjectId), eq(subjects.schoolId, context.schoolId)))
    .innerJoin(examGradingScales, and(eq(examGradingScales.id, examinations.gradingScaleId), eq(examGradingScales.schoolId, context.schoolId)))
    .where(and(
      eq(examSubjects.id, subjectId),
      eq(examSubjects.schoolId, context.schoolId),
      eq(examClasses.examinationId, examId),
    ))
    .limit(1);
  if (!subject) notFound();
  const canConfigure = context.grantedPermissions.includes("examinations.create");
  const canReview = context.grantedPermissions.includes("results.publish");
  let assignedTeacher = false;
  if (context.grantedPermissions.includes("results.enter")) {
    const assignment = await db.select({ id: examSubjects.id }).from(examSubjects)
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
      .where(and(eq(examSubjects.id, subject.id), eq(examSubjects.schoolId, context.schoolId)))
      .limit(1);
    assignedTeacher = assignment.length > 0;
    if (!assignedTeacher && !canConfigure && !canReview) notFound();
  } else if (!canConfigure && !canReview) {
    notFound();
  }
  const roster = await db.select({
    markId: examMarks.id,
    enrollmentId: studentEnrollments.id,
    studentId: students.id,
    studentPublicId: students.publicId,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    marks: examMarks.marks,
    teacherRemark: examMarks.teacherRemark,
    sectionId: classSections.id,
    classTeacherId: classSections.classTeacherId,
    classTeacherRemark: examStudentRemarks.classTeacherRemark,
  }).from(examMarks)
    .innerJoin(studentEnrollments, and(
      eq(studentEnrollments.id, examMarks.enrollmentId),
      eq(studentEnrollments.schoolId, context.schoolId),
    ))
    .innerJoin(examAttendance, and(
      eq(examAttendance.examSubjectId, examMarks.examSubjectId),
      eq(examAttendance.enrollmentId, studentEnrollments.id),
      eq(examAttendance.schoolId, context.schoolId),
      inArray(examAttendance.status, ["present", "late"]),
    ))
    .innerJoin(students, and(eq(students.id, studentEnrollments.studentId), eq(students.schoolId, context.schoolId)))
    .innerJoin(classSections, and(
      eq(classSections.id, studentEnrollments.classSectionId),
      eq(classSections.schoolId, context.schoolId),
      eq(classSections.classLevelId, subject.classLevelId),
      eq(classSections.academicYearId, subject.yearId),
    ))
    .leftJoin(examStudentRemarks, and(
      eq(examStudentRemarks.examClassId, subject.examClassId),
      eq(examStudentRemarks.enrollmentId, studentEnrollments.id),
      eq(examStudentRemarks.schoolId, context.schoolId),
    ))
    .where(and(
      eq(examMarks.examSubjectId, subject.id),
      eq(examMarks.schoolId, context.schoolId),
    ))
    .orderBy(asc(students.lastName), asc(students.firstName));
  const componentRows = roster.length
    ? await db.select({
      markId: examComponentMarks.examMarkId,
      componentId: examComponents.id,
      title: examComponents.title,
      maxMarks: examComponents.maxMarks,
      marks: examComponentMarks.marks,
      sortOrder: examComponents.sortOrder,
    }).from(examComponentMarks)
      .innerJoin(examComponents, and(
        eq(examComponents.id, examComponentMarks.examComponentId),
        eq(examComponents.schoolId, context.schoolId),
      ))
      .where(and(
        eq(examComponentMarks.schoolId, context.schoolId),
        inArray(examComponentMarks.examMarkId, roster.map((row) => row.markId)),
      ))
      .orderBy(asc(examComponents.sortOrder))
    : [];
  const componentsByMark = new Map<number, typeof componentRows>();
  for (const component of componentRows) {
    const current = componentsByMark.get(component.markId) ?? [];
    current.push(component);
    componentsByMark.set(component.markId, current);
  }
  const gradeBands = await db.select({
    minPercent: examGradeBands.minPercent,
    maxPercent: examGradeBands.maxPercent,
    grade: examGradeBands.grade,
    description: examGradeBands.description,
  }).from(examGradeBands).where(eq(examGradeBands.gradingScaleId, subject.scaleId))
    .orderBy(asc(examGradeBands.sortOrder));
  const audits = roster.length
    ? await db.select({
      examMarkId: examMarkAudits.examMarkId,
      componentTitle: examComponents.title,
      previousMarks: examMarkAudits.previousMarks,
      updatedMarks: examMarkAudits.updatedMarks,
      action: examMarkAudits.action,
      reason: examMarkAudits.reason,
      createdAt: examMarkAudits.createdAt,
    }).from(examMarkAudits)
      .leftJoin(examComponents, eq(examComponents.id, examMarkAudits.examComponentId))
      .where(and(
        eq(examMarkAudits.schoolId, context.schoolId),
        inArray(examMarkAudits.examMarkId, roster.map((row) => row.markId)),
      ))
      .orderBy(asc(examMarkAudits.createdAt))
    : [];
  const corrections = roster.length
    ? await db.select({
      examMarkId: examMarkCorrections.examMarkId,
      requestedMarks: examMarkCorrections.requestedMarks,
      previousMarks: examMarkCorrections.previousMarks,
      reason: examMarkCorrections.reason,
      status: examMarkCorrections.status,
      reviewNote: examMarkCorrections.reviewNote,
    }).from(examMarkCorrections).where(and(
      eq(examMarkCorrections.schoolId, context.schoolId),
      inArray(examMarkCorrections.examMarkId, roster.map((row) => row.markId)),
    ))
    : [];
  const editable = subject.examStatus === "open" && subject.status === "draft" && (canConfigure || canReview || assignedTeacher);
  const canRequestCorrection = subject.examStatus === "published" && context.grantedPermissions.includes("results.enter") && assignedTeacher;
  const studentRows = roster.map((row) => ({
    markId: row.markId,
    enrollmentId: row.enrollmentId,
    name: `${row.firstName} ${row.lastName}`,
    admissionNumber: row.admissionNumber,
    marks: row.marks,
    teacherRemark: row.teacherRemark,
    components: (componentsByMark.get(row.markId) ?? []).map((component) => ({
      id: component.componentId,
      title: component.title,
      maxMarks: component.maxMarks,
      marks: component.marks,
    })),
  }));
  const [myTeacher] = context.grantedPermissions.includes("results.enter")
    ? await db.select({ id: teachers.id }).from(teachers)
      .innerJoin(staffMembers, and(
        eq(staffMembers.id, teachers.staffMemberId!),
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.linkedUserId, context.user.id),
        eq(staffMembers.status, "active"),
      ))
      .where(and(eq(teachers.schoolId, context.schoolId), eq(teachers.status, "active")))
      .limit(1)
    : [];
  return (
    <main className="exam-report-document mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/admin/examinations/${examId}`} className="text-sm font-semibold text-violet-700">← {subject.examName}</Link>
          <p className="mt-4 text-sm font-semibold text-violet-700">{context.schoolName} · {subject.scaleName}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{subject.subjectName} marks</h1>
          <p className="mt-2 text-sm text-slate-600">{subject.className} · {subject.subjectCode} · {subject.examSystem === "multi" ? "Multi Exam" : "Single Exam"} · Exam date {subject.examDate} · Maximum {subject.maxMarks} · Weight {subject.weight} · {subject.status}</p>
        </div>
        <PrintButton label="Print marks-only sheet" targetId="exam-marks-only-sheet" pageOrientation="landscape" pageSize="A4" />
      </header>

      {subject.examStatus === "open" && subject.status === "approved" && canReview && (
        <ReopenApprovedSubjectForm examSubjectId={subject.id} />
      )}

      <section id="exam-marks-only-sheet" className="hidden print:block print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-6 print:rounded-none print:border-0 print:p-0">
        <header className="print-report-heading">
          <p className="text-xs font-semibold uppercase tracking-wide">{context.schoolName}</p>
          <h2 className="mt-1 text-xl font-bold">{subject.examName} — {subject.className} · {subject.subjectName}</h2>
          <p className="mt-1 text-sm">{subject.examDate} · Maximum {subject.maxMarks}</p>
        </header>
        <div className="overflow-x-auto">
          <table className="print-report-table w-full min-w-[700px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Student</th>
                <th className="p-2">Admission no.</th>
                {(componentsByMark.get(roster[0]?.markId ?? -1) ?? []).map((component) => (
                  <th key={component.componentId} className="p-2">{component.title} / {component.maxMarks}</th>
                ))}
                <th className="p-2">Total / {subject.maxMarks}</th>
              </tr>
            </thead>
            <tbody>{roster.map((row) => (
              <tr key={row.markId}>
                <td className="p-2">{row.firstName} {row.lastName}</td>
                <td className="p-2">{row.admissionNumber ?? "—"}</td>
                {(componentsByMark.get(row.markId) ?? []).map((component) => (
                  <td key={component.componentId} className="p-2">{component.marks ?? "—"}</td>
                ))}
                <td className="p-2">{row.marks ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section id="exam-mark-list" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="print-report-heading">
          <h2 className="text-xl font-bold">{subject.className} · {subject.subjectName} — marks roster</h2>
          <p className="text-sm text-slate-600">{roster.length} students marked present or late · {subject.examSystem === "multi" ? "component marks are summed" : "single component"} · max {subject.maxMarks} marks · assessment weight {subject.weight}</p>
        </div>
        {editable && <SaveMarksForm
          examSubjectId={subject.id}
          maxMarks={subject.maxMarks}
          students={studentRows}
          componentMarkCount={componentRows.length}
          editable
        />}
        {!editable && (
          <div className="overflow-x-auto">
            <table className="print-report-table w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Admission no.</th>{(componentsByMark.get(roster[0]?.markId ?? -1) ?? []).map((component) => <th key={component.componentId} className="p-3">{component.title} / {component.maxMarks}</th>)}<th className="p-3">Total / {subject.maxMarks}</th><th className="p-3">Grade</th><th className="p-3">Teacher remark</th></tr></thead>
              <tbody>{roster.map((row) => {
                const percentage = row.marks === null ? null : Number(row.marks) / Number(subject.maxMarks) * 100;
                const grade = percentage === null ? null : gradeBands.find((band) => percentage >= Number(band.minPercent) && (percentage < Number(band.maxPercent) || Number(band.maxPercent) === 100));
                return <tr key={row.markId} className="border-t"><td className="p-3">{row.firstName} {row.lastName}</td><td className="p-3">{row.admissionNumber ?? "—"}</td>{(componentsByMark.get(row.markId) ?? []).map((component) => <td key={component.componentId} className="p-3">{component.marks ?? "Not entered"}</td>)}<td className="p-3">{row.marks ?? "Incomplete"}</td><td className="p-3">{grade?.grade ?? "—"}</td><td className="p-3">{row.teacherRemark ?? "—"}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
        {roster.length === 0 && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No students with Present or Late exam attendance were found. Record exam attendance first; absent, excused, and unmarked students cannot receive marks.</p>}
      </section>

      {subject.examStatus === "open" && subject.status === "draft" && (canConfigure || canReview || assignedTeacher) && roster.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">Submit for approval</h2>
          <p className="mt-1 text-sm text-slate-600">All marks must be saved and complete. After submission, you cannot edit marks unless a reviewer returns the assessment.</p>
          <SubmitSubjectForm examSubjectId={subject.id} />
        </section>
      )}

      {canRequestCorrection && (
        <section className="rounded-2xl border border-amber-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">Request a published-mark correction</h2>
          <p className="mt-1 text-sm text-slate-600">The published score stays unchanged until an authorized reviewer approves a request.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {roster.map((row) => {
              const markCorrections = corrections.filter((correction) => correction.examMarkId === row.markId);
              const pending = markCorrections.find((correction) => correction.status === "pending");
              return row.marks === null ? null : (
                <article key={row.markId} className="rounded-xl border p-3">
                  <p className="font-semibold">{row.firstName} {row.lastName} · {row.marks}/{subject.maxMarks}</p>
                  {pending
                    ? <p className="mt-1 text-xs text-amber-800">Pending request: {pending.previousMarks} → {pending.requestedMarks}. {pending.reason}</p>
                    : <CorrectionRequestForm examMarkId={row.markId} previousMarks={row.marks} maxMarks={subject.maxMarks} />}
                  {markCorrections.length > 0 && (
                    <div className="mt-3 space-y-1 border-t pt-2 text-xs text-slate-600">
                      <p className="font-semibold">Correction history</p>
                      {markCorrections.map((correction, index) => (
                        <p key={`${correction.examMarkId}-${index}`}>
                          {correction.status}: {correction.previousMarks} → {correction.requestedMarks} · {correction.reason}
                          {correction.reviewNote ? ` · Reviewer: ${correction.reviewNote}` : ""}
                        </p>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-950">Class teacher remarks</h2>
        <p className="mt-1 text-sm text-slate-600">These remarks appear on each student report card and can only be changed before publication.</p>
        <div className="mt-4">
          <SearchableStudentItems
            items={roster.map((row) => ({
              id: row.enrollmentId,
              name: `${row.firstName} ${row.lastName}`,
              admissionNumber: row.admissionNumber,
              content: <article className="rounded-xl border p-4">
                <p className="font-semibold">{row.firstName} {row.lastName} <span className="text-xs font-normal text-slate-500">{row.admissionNumber}</span></p>
                {subject.examStatus === "open" && (canConfigure || row.classTeacherId === myTeacher?.id) ? (
                  <ClassTeacherRemarkForm examClassId={subject.examClassId} enrollmentId={row.enrollmentId} remark={row.classTeacherRemark} />
                ) : <p className="mt-2 text-sm text-slate-600">{row.classTeacherRemark ?? "No class teacher remark."}</p>}
                <div className="mt-3 space-y-1 border-t pt-3 text-xs text-slate-500">
                  {audits.filter((audit) => audit.examMarkId === row.markId).map((audit, index) => (
                    <p key={`${audit.examMarkId}-${index}`}>{audit.componentTitle ? `${audit.componentTitle} history` : "Total mark history"}: {audit.action} · {audit.previousMarks ?? "—"} → {audit.updatedMarks ?? "—"}{audit.reason ? ` · ${audit.reason}` : ""}</p>
                  ))}
                </div>
                {subject.examStatus === "published" && (
                  <Link href={`/admin/examinations/${examId}/report-cards/${row.enrollmentId}`} className="mt-3 inline-block text-sm font-semibold text-violet-700">Open report card →</Link>
                )}
                {subject.examStatus === "open" && subject.examName.startsWith("TEST DATA - ") && (canConfigure || canReview) && (
                  <Link href={`/admin/examinations/${examId}/report-cards/${row.enrollmentId}?preview=test`} className="mt-3 inline-block text-sm font-semibold text-amber-800">Preview draft test report →</Link>
                )}
              </article>,
            }))}
            emptyMessage="No students match this search."
          />
        </div>
      </section>
    </main>
  );
}
