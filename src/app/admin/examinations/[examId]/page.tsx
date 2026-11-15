import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
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
  PrincipalRemarkForm,
  PublishExaminationForm,
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
    assignedIds = [...new Set(assigned.map((row) => row.id))];
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
  const classRows = await db.select({
    id: examClasses.id,
    classLevelId: classLevels.id,
    className: classLevels.name,
    principalRemark: examClasses.principalRemark,
  }).from(examClasses).innerJoin(classLevels, and(
    eq(classLevels.id, examClasses.classLevelId),
    eq(classLevels.schoolId, context.schoolId),
  )).where(and(eq(examClasses.schoolId, context.schoolId), eq(examClasses.examinationId, exam.id)))
    .orderBy(asc(classLevels.name));
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
  const publishReady = allSubjects.length > 0 && allSubjects.every((subject) => subject.status === "approved");

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/examinations" className="text-sm font-semibold text-violet-700">← Examinations</Link>
          <p className="mt-4 text-sm font-semibold text-violet-700">{context.schoolName} · {exam.yearName}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{exam.name}</h1>
          <p className="mt-2 text-sm text-slate-600">{exam.examTypeName ? `${exam.examTypeName} · ` : ""}{exam.branchName ?? "All branches"} · {exam.examSystem === "multi" ? "Multi Exam" : "Single Exam"} · {exam.startDate} – {exam.endDate} · {overallStatus}</p>
        </div>
        {canReview && exam.status === "open" && <PublishExaminationForm examinationId={exam.id} />}
      </header>

      {canReview && exam.status === "open" && (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-bold text-slate-900">Publication checklist</h2>
          <p className="mt-1 text-sm text-slate-600">{allSubjects.filter((subject) => subject.status === "approved").length} of {allSubjects.length} assessments approved. {publishReady ? "All subject approvals are in; publication also rechecks every roster for complete marks." : "All assessments must be submitted and approved."}</p>
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
        <h2 className="text-xl font-bold text-slate-950">Classes and assessments</h2>
        {classRows.map((classRow) => {
          const subjectRows = visibleSubjects.filter((subject) => subject.examClassId === classRow.id);
          if (!subjectRows.length) return null;
          return (
            <article key={classRow.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 p-4">
                <h3 className="text-lg font-bold">{classRow.className}</h3>
                <span className="text-sm text-slate-500">{subjectRows.length} subjects</span>
              </div>
              {canReview && exam.status === "open" && <div className="p-4"><PrincipalRemarkForm examClassId={classRow.id} remark={classRow.principalRemark} /></div>}
              <div className="divide-y">
                {subjectRows.map((subject) => (
                  <div key={subject.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-slate-900">{subject.subjectName} <span className="text-xs font-normal text-slate-500">({subject.subjectCode})</span></h4>
                        <p className="mt-1 text-xs text-slate-500">Teacher: {subject.teacherFirstName ? `${subject.teacherFirstName} ${subject.teacherLastName}` : "Not assigned"} · {subject.examDate} · Maximum {subject.maxMarks} · Weight {subject.weight}</p>
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
