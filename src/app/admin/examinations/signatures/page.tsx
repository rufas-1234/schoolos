import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { examReportSignatures, examTeacherSignatures, staffMembers, teachers } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { SignatureForm, type SignatureRole } from "./signature-form";
import { TeacherSignatureForm } from "./teacher-signature-form";

export const dynamic = "force-dynamic";

export default async function ExamReportSignaturesPage() {
  const context = await requireSchoolPermission([
    "examinations.create",
    "results.publish",
    "school.settings.manage",
    "results.enter",
  ]);
  const canManageAll = context.grantedPermissions.some((permission) =>
    ["examinations.create", "results.publish", "school.settings.manage"].includes(permission),
  );
  const [headteacherSignature, teacherRows] = await Promise.all([
    canManageAll
      ? db.select({
        role: examReportSignatures.role,
        updatedAt: examReportSignatures.updatedAt,
      }).from(examReportSignatures).where(and(
        eq(examReportSignatures.schoolId, context.schoolId),
        eq(examReportSignatures.role, "headteacher"),
      )).then((rows) => rows[0])
      : Promise.resolve(undefined),
    (canManageAll
      ? db.select({
        id: teachers.id,
        firstName: teachers.firstName,
        lastName: teachers.lastName,
        jobTitle: staffMembers.jobTitle,
      }).from(teachers)
        .leftJoin(staffMembers, and(
          eq(staffMembers.id, teachers.staffMemberId!),
          eq(staffMembers.schoolId, context.schoolId),
        ))
        .where(and(
          eq(teachers.schoolId, context.schoolId),
          eq(teachers.status, "active"),
        ))
      : db.select({
        id: teachers.id,
        firstName: teachers.firstName,
        lastName: teachers.lastName,
        jobTitle: staffMembers.jobTitle,
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
        )))
      .orderBy(asc(teachers.lastName), asc(teachers.firstName)),
  ]);
  const teacherSignatures = teacherRows.length
    ? await db.select({
      id: examTeacherSignatures.id,
      teacherId: examTeacherSignatures.teacherId,
    }).from(examTeacherSignatures).where(and(
      eq(examTeacherSignatures.schoolId, context.schoolId),
      inArray(examTeacherSignatures.teacherId, teacherRows.map((teacher) => teacher.id)),
    )).orderBy(desc(examTeacherSignatures.createdAt), desc(examTeacherSignatures.id))
    : [];
  const latestSignatureByTeacher = new Map<number, number>();
  for (const signature of teacherSignatures) {
    if (!latestSignatureByTeacher.has(signature.teacherId)) {
      latestSignatureByTeacher.set(signature.teacherId, signature.id);
    }
  }

  return <main className="space-y-6 p-4 sm:p-6">
    <header>
      <p className="text-sm font-semibold text-violet-700">Examinations</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Report signatures</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">Teachers upload their signature once. Reports select the assigned class or subject teacher automatically; replaced uploads remain available as prior versions.</p>
    </header>
    {canManageAll && <section className="max-w-xl">
      <SignatureForm role={"headteacher" satisfies SignatureRole} version={headteacherSignature?.updatedAt.getTime()} />
    </section>}
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-950">{canManageAll ? "Teacher signatures" : "My report signature"}</h2>
      {teacherRows.length
        ? <div className="grid gap-4 lg:grid-cols-2">
          {teacherRows.map((teacher) => (
            <TeacherSignatureForm
              key={teacher.id}
              teacherId={teacher.id}
              teacherName={`${teacher.firstName} ${teacher.lastName}`}
              jobTitle={teacher.jobTitle ?? ""}
              signatureId={latestSignatureByTeacher.get(teacher.id)}
            />
          ))}
        </div>
        : <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No active teacher profile is linked to your account. Ask a school administrator to link your staff account to a teacher profile.</p>}
    </section>
  </main>;
}
