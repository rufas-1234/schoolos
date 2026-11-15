import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classLevels,
  classSubjects,
  examClasses,
  examGradeBands,
  examGradingScales,
  examSubjects,
  examinations,
  staffMembers,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { CreateExaminationForm, CreateGradingScaleForm } from "./examination-forms";

export const dynamic = "force-dynamic";

export default async function ExaminationsPage() {
  const context = await requireSchoolPermission(["examinations.create", "results.enter", "results.publish"]);
  const canConfigure = context.grantedPermissions.includes("examinations.create");
  const [years, terms, classes, scales] = await Promise.all([
    canConfigure
      ? db.select({ id: academicYears.id, name: academicYears.name }).from(academicYears)
        .where(eq(academicYears.schoolId, context.schoolId)).orderBy(asc(academicYears.startDate))
      : Promise.resolve([]),
    canConfigure
      ? db.select({
        id: academicTerms.id,
        academicYearId: academicTerms.academicYearId,
        name: academicTerms.name,
      }).from(academicTerms).where(eq(academicTerms.schoolId, context.schoolId)).orderBy(asc(academicTerms.startDate))
      : Promise.resolve([]),
    canConfigure
      ? db.select({ id: classLevels.id, name: classLevels.name }).from(classLevels)
        .where(and(eq(classLevels.schoolId, context.schoolId), eq(classLevels.status, "active")))
        .orderBy(asc(classLevels.name))
      : Promise.resolve([]),
    canConfigure
      ? db.select({
        id: examGradingScales.id,
        name: examGradingScales.name,
        isDefault: examGradingScales.isDefault,
        allowRanking: examGradingScales.allowRanking,
      }).from(examGradingScales).where(eq(examGradingScales.schoolId, context.schoolId))
        .orderBy(asc(examGradingScales.name))
      : Promise.resolve([]),
  ]);
  const isManager = canConfigure || context.grantedPermissions.includes("results.publish");
  let exams: Array<{
    id: number;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
    yearName: string;
    scaleName: string;
  }>;
  if (isManager) {
    exams = await db.select({
      id: examinations.id,
      name: examinations.name,
      status: examinations.status,
      startDate: examinations.startDate,
      endDate: examinations.endDate,
      yearName: academicYears.name,
      scaleName: examGradingScales.name,
    }).from(examinations)
      .innerJoin(academicYears, and(
        eq(academicYears.id, examinations.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .innerJoin(examGradingScales, and(
        eq(examGradingScales.id, examinations.gradingScaleId),
        eq(examGradingScales.schoolId, context.schoolId),
      ))
      .where(eq(examinations.schoolId, context.schoolId))
      .orderBy(asc(academicYears.startDate), asc(examinations.startDate));
  } else {
    const assignments = await db.select({ examId: examinations.id }).from(examSubjects)
      .innerJoin(examClasses, eq(examClasses.id, examSubjects.examClassId))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
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
      ))
      .where(eq(staffMembers.status, "active"));
    const ids = [...new Set(assignments.map((entry) => entry.examId))];
    exams = ids.length
      ? await db.select({
        id: examinations.id,
        name: examinations.name,
        status: examinations.status,
        startDate: examinations.startDate,
        endDate: examinations.endDate,
        yearName: academicYears.name,
        scaleName: examGradingScales.name,
      }).from(examinations)
        .innerJoin(academicYears, eq(academicYears.id, examinations.academicYearId))
        .innerJoin(examGradingScales, eq(examGradingScales.id, examinations.gradingScaleId))
        .where(and(eq(examinations.schoolId, context.schoolId), inArray(examinations.id, ids)))
        .orderBy(asc(examinations.startDate))
      : [];
  }
  const gradeBands = scales.length
    ? await db.select({
      scaleId: examGradeBands.gradingScaleId,
      min: examGradeBands.minPercent,
      max: examGradeBands.maxPercent,
      grade: examGradeBands.grade,
      description: examGradeBands.description,
      remark: examGradeBands.performanceRemark,
    }).from(examGradeBands).where(inArray(examGradeBands.gradingScaleId, scales.map((scale) => scale.id)))
      .orderBy(asc(examGradeBands.gradingScaleId), asc(examGradeBands.sortOrder))
    : [];
  const scalesWithBands = scales.map((scale) => ({
    ...scale,
    bands: gradeBands.filter((band) => band.scaleId === scale.id),
  }));

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-6">
      <header>
        <p className="text-sm font-semibold text-violet-700">{context.schoolName}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">Examinations &amp; results</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">Set up assessments, enter and review marks, then publish complete results and printable report cards. Published marks are locked; corrections are reviewed and retained in the audit history.</p>
      </header>

      {canConfigure && (
        <section className="grid gap-5 lg:grid-cols-2">
          <CreateExaminationForm years={years} terms={terms} scales={scales} classes={classes} />
          <div className="space-y-4">
            <CreateGradingScaleForm />
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold text-slate-900">Grading rules</h2>
              <p className="mt-1 text-sm text-slate-600">Subject percentage = marks ÷ maximum marks × 100. Overall percentage is the weighted mean of each subject percentage. Grades use inclusive lower bounds, with the top band including 100%. Class rank uses competition ranking (tied ranks share a position, the next rank skips).</p>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Examination records</h2>
            <p className="text-sm text-slate-500">{isManager ? "All school examinations" : "Examinations containing your assigned subjects"}</p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="p-4">Examination</th><th className="p-4">Academic year</th><th className="p-4">Dates</th><th className="p-4">Grading scale</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id} className="border-t border-slate-100">
                  <td className="p-4 font-semibold text-slate-900">{exam.name}</td>
                  <td className="p-4">{exam.yearName}</td>
                  <td className="p-4">{exam.startDate} – {exam.endDate}</td>
                  <td className="p-4">{exam.scaleName}</td>
                  <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${exam.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{exam.status}</span></td>
                  <td className="p-4"><Link className="font-semibold text-violet-700 hover:text-violet-900" href={`/admin/examinations/${exam.id}`}>Open examination</Link></td>
                </tr>
              ))}
              {exams.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-500">No examinations are available yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {canConfigure && scalesWithBands.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-slate-950">Configured grading scales</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {scalesWithBands.map((scale) => (
              <article key={scale.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-2"><h3 className="font-bold">{scale.name}</h3>{scale.isDefault && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">Default</span>}</div>
                <p className="mt-1 text-xs text-slate-500">Class ranking {scale.allowRanking ? "enabled" : "disabled"}</p>
                <div className="mt-3 flex flex-wrap gap-2">{scale.bands.map((band) => <span key={band.grade} className="rounded-lg bg-slate-50 px-3 py-2 text-xs"><b>{band.grade}</b> {band.min}%–{band.max}% · {band.description}</span>)}</div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
