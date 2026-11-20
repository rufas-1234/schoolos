import Link from "next/link";
import Image from "next/image";
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
  examMarks,
  examReportSignatures,
  examStudentRemarks,
  examSubjects,
  examinations,
  schools,
  studentEnrollments,
  students,
  subjects,
  staffMembers,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { canViewExamSubject } from "@/lib/examination-policy";
import { schoolLogoSource } from "@/lib/school-logo";
import { PrintButton } from "@/components/print-button";
import { ReportSignatureStrip } from "@/app/admin/examinations/signatures/report-signature-strip";
import {
  ClassTeacherRemarkForm,
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
    isCompulsory: classSubjects.isCompulsory,
    status: examSubjects.status,
    examStatus: examinations.status,
    examPublicId: examinations.publicId,
    yearId: examinations.academicYearId,
    branchId: examinations.branchId,
    examSystem: examinations.examSystem,
    scaleId: examGradingScales.id,
    scaleName: examGradingScales.name,
    classLevelId: examClasses.classLevelId,
    classTeacherId: examClasses.classTeacherId,
    schoolName: schools.name,
    schoolLogoUrl: schools.logoUrl,
    schoolAddress: schools.address,
    schoolPhone: schools.phone,
    schoolEmail: schools.email,
  }).from(examSubjects)
    .innerJoin(examClasses, and(eq(examClasses.id, examSubjects.examClassId), eq(examClasses.schoolId, context.schoolId)))
    .innerJoin(examinations, and(eq(examinations.id, examClasses.examinationId), eq(examinations.schoolId, context.schoolId)))
    .innerJoin(classLevels, and(eq(classLevels.id, examClasses.classLevelId), eq(classLevels.schoolId, context.schoolId)))
    .innerJoin(classSubjects, and(eq(classSubjects.id, examSubjects.classSubjectId), eq(classSubjects.schoolId, context.schoolId)))
    .innerJoin(subjects, and(eq(subjects.id, classSubjects.subjectId), eq(subjects.schoolId, context.schoolId)))
    .innerJoin(examGradingScales, and(eq(examGradingScales.id, examinations.gradingScaleId), eq(examGradingScales.schoolId, context.schoolId)))
    .innerJoin(schools, eq(schools.id, context.schoolId))
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
  let assignedClassTeacher = false;
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
    let manuallyAssignedClassTeacher = false;
    if (subject.classTeacherId !== null) {
      const [classTeacher] = await db.select({ id: teachers.id }).from(teachers)
        .innerJoin(staffMembers, and(
          eq(staffMembers.id, teachers.staffMemberId!),
          eq(staffMembers.schoolId, context.schoolId),
          eq(staffMembers.linkedUserId, context.user.id),
          eq(staffMembers.status, "active"),
        ))
        .where(and(
          eq(teachers.id, subject.classTeacherId),
          eq(teachers.schoolId, context.schoolId),
          eq(teachers.status, "active"),
        ))
        .limit(1);
      manuallyAssignedClassTeacher = Boolean(classTeacher);
    }
    const [sectionClassTeacher] = await db.select({ id: classSections.id }).from(classSections)
      .innerJoin(teachers, and(
        eq(teachers.id, classSections.classTeacherId!),
        eq(teachers.schoolId, context.schoolId),
        eq(teachers.status, "active"),
      ))
      .innerJoin(staffMembers, and(
        eq(staffMembers.id, teachers.staffMemberId!),
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.linkedUserId, context.user.id),
        eq(staffMembers.status, "active"),
      ))
      .where(and(
        eq(classSections.schoolId, context.schoolId),
        eq(classSections.classLevelId, subject.classLevelId),
        eq(classSections.academicYearId, subject.yearId),
      ))
      .limit(1);
    assignedClassTeacher = manuallyAssignedClassTeacher || Boolean(sectionClassTeacher);
  }
  if (!canViewExamSubject(context.grantedPermissions, assignedTeacher || assignedClassTeacher)) notFound();
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
    attendanceStatus: examAttendance.status,
    sectionId: classSections.id,
    classTeacherId: classSections.classTeacherId,
    classTeacherRemark: examStudentRemarks.classTeacherRemark,
  }).from(examMarks)
    .innerJoin(studentEnrollments, and(
      eq(studentEnrollments.id, examMarks.enrollmentId),
      eq(studentEnrollments.schoolId, context.schoolId),
    ))
    .leftJoin(examAttendance, and(
      eq(examAttendance.examSubjectId, examMarks.examSubjectId),
      eq(examAttendance.enrollmentId, studentEnrollments.id),
      eq(examAttendance.schoolId, context.schoolId),
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
  const specialStatusRows = await db.select({
    name: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    status: examAttendance.status,
    note: examAttendance.note,
  }).from(examAttendance)
    .innerJoin(studentEnrollments, and(
      eq(studentEnrollments.id, examAttendance.enrollmentId),
      eq(studentEnrollments.schoolId, context.schoolId),
    ))
    .innerJoin(classSections, and(
      eq(classSections.id, studentEnrollments.classSectionId),
      eq(classSections.schoolId, context.schoolId),
      eq(classSections.classLevelId, subject.classLevelId),
      eq(classSections.academicYearId, subject.yearId),
    ))
    .innerJoin(students, and(
      eq(students.id, studentEnrollments.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .where(and(
      eq(examAttendance.examSubjectId, subject.id),
      eq(examAttendance.schoolId, context.schoolId),
      inArray(examAttendance.status, ["not_applicable", "x", "y"]),
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
  const editable = subject.examStatus === "open" && subject.status === "draft" && assignedTeacher;
  const studentRows = roster.map((row) => ({
    markId: row.markId,
    enrollmentId: row.enrollmentId,
    name: `${row.firstName} ${row.lastName}`,
    admissionNumber: row.admissionNumber,
    marks: row.marks,
    teacherRemark: row.teacherRemark,
    attendanceStatus: row.attendanceStatus,
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
  const signatureRows = await db.select({
    role: examReportSignatures.role,
    updatedAt: examReportSignatures.updatedAt,
  })
    .from(examReportSignatures)
    .where(eq(examReportSignatures.schoolId, context.schoolId));
  const schoolLogo = schoolLogoSource(subject.schoolLogoUrl);
  return (
    <main className="exam-report-document mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/admin/examinations/${examId}`} className="text-sm font-semibold text-violet-700">← {subject.examName}</Link>
          <p className="mt-4 text-sm font-semibold text-violet-700">{context.schoolName} · {subject.scaleName}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{subject.subjectName} marks</h1>
          <p className="mt-2 text-sm text-slate-600">{subject.className} · {subject.subjectCode} · {subject.isCompulsory ? "Compulsory" : "Optional"} · {subject.examSystem === "multi" ? "Multi Exam" : "Single Exam"} · Exam date {subject.examDate} · Maximum {subject.maxMarks} · Weight {subject.weight} · {subject.status}</p>
        </div>
        <PrintButton label="Print marks-only sheet" targetId="exam-marks-only-sheet" pageOrientation="landscape" pageSize="A4" />
      </header>

      {subject.examStatus === "open" && subject.status === "approved" && canReview && (
        <ReopenApprovedSubjectForm examSubjectId={subject.id} />
      )}

      <section id="exam-marks-only-sheet" className="hidden print:block print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-6 print:rounded-none print:border-0 print:p-0">
        <header className="print-report-heading flex items-center gap-4">
          {schoolLogo && <Image src={schoolLogo} unoptimized width={56} height={56} alt={`${subject.schoolName} logo`} className="exam-report-school-logo h-14 w-14 object-contain" />}
          <div className="min-w-0 flex-1">
            <p className="exam-report-school-name text-xs font-semibold uppercase tracking-wide">{subject.schoolName}</p>
            <p className="exam-report-school-contact mt-0.5 text-xs">
              {[subject.schoolAddress, subject.schoolPhone, subject.schoolEmail].filter(Boolean).join(" · ")}
            </p>
            <h2 className="mt-1 text-xl font-bold">{subject.examName} — {subject.className} · {subject.subjectName}</h2>
            <p className="mt-1 text-sm">{subject.examDate} · Maximum {subject.maxMarks}</p>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="print-report-table w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Student</th>
                <th className="p-2">Admission no.</th>
                <th className="p-2">Attendance</th>
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
                <td className="p-2">{row.attendanceStatus ?? "Not recorded"}</td>
                {(componentsByMark.get(row.markId) ?? []).map((component) => (
                  <td key={component.componentId} className="p-2">{component.marks ?? "—"}</td>
                ))}
                <td className="p-2">{row.marks ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <ReportSignatureStrip signatures={signatureRows} />
      </section>

      <section id="exam-mark-list" className="print-report-content space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="print-report-heading">
          <h2 className="text-xl font-bold">{subject.className} · {subject.subjectName} — marks roster</h2>
          <p className="text-sm text-slate-600">{roster.length} enrolled students · {subject.examSystem === "multi" ? "component marks are summed" : "single component"} · max {subject.maxMarks} marks · assessment weight {subject.weight}</p>
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
            <table className="print-report-table w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Admission no.</th><th className="p-3">Attendance</th>{(componentsByMark.get(roster[0]?.markId ?? -1) ?? []).map((component) => <th key={component.componentId} className="p-3">{component.title} / {component.maxMarks}</th>)}<th className="p-3">Total / {subject.maxMarks}</th><th className="p-3">Grade</th><th className="p-3">Teacher remark</th></tr></thead>
              <tbody>{roster.map((row) => {
                const percentage = row.marks === null ? null : Number(row.marks) / Number(subject.maxMarks) * 100;
                const grade = percentage === null ? null : gradeBands.find((band) => percentage >= Number(band.minPercent) && (percentage < Number(band.maxPercent) || Number(band.maxPercent) === 100));
                return <tr key={row.markId} className="border-t"><td className="p-3">{row.firstName} {row.lastName}</td><td className="p-3">{row.admissionNumber ?? "—"}</td><td className="p-3">{row.attendanceStatus ?? "Not recorded"}</td>{(componentsByMark.get(row.markId) ?? []).map((component) => <td key={component.componentId} className="p-3">{component.marks ?? "Not entered"}</td>)}<td className="p-3">{row.marks ?? "Incomplete"}</td><td className="p-3">{grade?.grade ?? "—"}</td><td className="p-3">{row.teacherRemark ?? "—"}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
        {roster.length === 0 && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No enrolled students were found for this class and academic year.</p>}
      </section>

      {specialStatusRows.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-950">No-score statuses</h2>
          <p className="mt-1 text-sm text-amber-900">X is recorded as Cambridge-style “No result”; Y is a school-defined irregularity code and is not an official Cambridge grade. Neither code receives a numeric mark or grade.</p>
          <ul className="mt-3 space-y-2 text-sm text-amber-950">
            {specialStatusRows.map((row) => (
              <li key={`${row.status}-${row.name}-${row.lastName}-${row.admissionNumber}`} className="rounded-lg border border-amber-200 bg-white p-3">
                <span className="font-semibold">{row.name} {row.lastName}</span> · {row.admissionNumber ?? "No admission number"} · {row.status === "not_applicable" ? "Not taking optional subject" : row.status.toUpperCase()}
                {row.note && <span className="block text-xs text-slate-600">Note: {row.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {subject.examStatus === "open" && subject.status === "draft" && assignedTeacher && roster.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">Submit for approval</h2>
          <p className="mt-1 text-sm text-slate-600">Submit a complete marks roster for review. Attendance is recorded separately and does not determine who appears on this marks sheet. After submission, you cannot edit marks unless a reviewer returns the assessment for correction. Published results cannot be changed through a teacher correction request.</p>
          <SubmitSubjectForm examSubjectId={subject.id} />
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
                {subject.examStatus === "published" && (canConfigure || canReview || row.classTeacherId === myTeacher?.id) && (
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
