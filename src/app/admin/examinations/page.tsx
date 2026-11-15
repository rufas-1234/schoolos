import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classSections,
  classLevels,
  classSubjects,
  examClasses,
  examAttendance,
  examGradeBands,
  examGradingScales,
  examMarks,
  examSubjects,
  examTypes,
  examinations,
  schoolBranches,
  staffMembers,
  subjects,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  CreateExamTypeForm,
  CreateExaminationForm,
  CreateGradingScaleForm,
} from "./examination-forms";

export const dynamic = "force-dynamic";

export default async function ExaminationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string;
    branchId?: string;
    examId?: string;
    classLevelId?: string;
    sectionId?: string;
    subjectId?: string;
  }>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.enter", "results.publish"]);
  const {
    section: requestedSection,
    branchId: rawBranchId,
    examId: rawExamId,
    classLevelId: rawClassLevelId,
    sectionId: rawSectionId,
    subjectId: rawSubjectId,
  } = await searchParams;
  const branchFilter = rawBranchId && /^\d+$/.test(rawBranchId) ? Number(rawBranchId) : null;
  const examFilter = rawExamId && /^\d+$/.test(rawExamId) ? Number(rawExamId) : null;
  const classFilter = rawClassLevelId && /^\d+$/.test(rawClassLevelId) ? Number(rawClassLevelId) : null;
  const sectionFilter = rawSectionId && /^\d+$/.test(rawSectionId) ? Number(rawSectionId) : null;
  const subjectFilter = rawSubjectId && /^\d+$/.test(rawSubjectId) ? Number(rawSubjectId) : null;
  const section = ["types", "setup", "schedule", "attendance", "marks", "grades", "sms"].includes(requestedSection ?? "")
    ? requestedSection!
    : "setup";
  const canConfigure = context.grantedPermissions.includes("examinations.create");
  const today = new Date().toISOString().slice(0, 10);
  const [years, terms, branches, classes, scales, examTypesList] = await Promise.all([
    canConfigure
      ? db.select({
        id: academicYears.id,
        name: academicYears.name,
        status: academicYears.status,
        startDate: academicYears.startDate,
        endDate: academicYears.endDate,
      }).from(academicYears)
        .where(eq(academicYears.schoolId, context.schoolId)).orderBy(asc(academicYears.startDate))
      : Promise.resolve([]),
    canConfigure
      ? db.select({
        id: academicTerms.id,
        academicYearId: academicTerms.academicYearId,
        name: academicTerms.name,
        startDate: academicTerms.startDate,
        endDate: academicTerms.endDate,
      }).from(academicTerms).where(eq(academicTerms.schoolId, context.schoolId)).orderBy(asc(academicTerms.startDate))
      : Promise.resolve([]),
    db.select({ id: schoolBranches.id, name: schoolBranches.name }).from(schoolBranches)
      .where(and(eq(schoolBranches.schoolId, context.schoolId), eq(schoolBranches.status, "active")))
      .orderBy(asc(schoolBranches.name)),
    canConfigure
      ? db.select({
        id: classLevels.id,
        name: classLevels.name,
        branchId: classLevels.branchId,
        branchName: schoolBranches.name,
      }).from(classLevels)
        .innerJoin(schoolBranches, and(
          eq(schoolBranches.id, classLevels.branchId),
          eq(schoolBranches.schoolId, context.schoolId),
        ))
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
    db.select({
        id: examTypes.id,
        name: examTypes.name,
        branchId: examTypes.branchId,
        branchName: schoolBranches.name,
        averagePassing: examTypes.averagePassing,
        averageMark: examTypes.averageMark,
      }).from(examTypes)
        .leftJoin(schoolBranches, and(eq(schoolBranches.id, examTypes.branchId!), eq(schoolBranches.schoolId, context.schoolId)))
        .where(eq(examTypes.schoolId, context.schoolId)).orderBy(asc(examTypes.name))
  ]);
  const isManager = canConfigure || context.grantedPermissions.includes("results.publish");
  let exams: Array<{
    id: number;
    name: string;
    status: string;
    examSystem: string;
    startDate: string;
    endDate: string;
    yearName: string;
    branchId: number | null;
    branchName: string | null;
    examTypeName: string | null;
    scaleName: string;
  }>;
  if (isManager) {
    exams = await db.select({
      id: examinations.id,
      name: examinations.name,
      examSystem: examinations.examSystem,
      branchId: examinations.branchId,
      branchName: schoolBranches.name,
      status: examinations.status,
      startDate: examinations.startDate,
      endDate: examinations.endDate,
      yearName: academicYears.name,
      examTypeName: examTypes.name,
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
      .leftJoin(examTypes, and(
        eq(examTypes.id, examinations.examTypeId!),
        eq(examTypes.schoolId, context.schoolId),
      ))
      .leftJoin(schoolBranches, and(
        eq(schoolBranches.id, examinations.branchId!),
        eq(schoolBranches.schoolId, context.schoolId),
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
        examSystem: examinations.examSystem,
        branchId: examinations.branchId,
        branchName: schoolBranches.name,
        status: examinations.status,
        startDate: examinations.startDate,
        endDate: examinations.endDate,
        yearName: academicYears.name,
        examTypeName: examTypes.name,
        scaleName: examGradingScales.name,
      }).from(examinations)
        .innerJoin(academicYears, eq(academicYears.id, examinations.academicYearId))
        .innerJoin(examGradingScales, eq(examGradingScales.id, examinations.gradingScaleId))
        .leftJoin(examTypes, and(eq(examTypes.id, examinations.examTypeId!), eq(examTypes.schoolId, context.schoolId)))
        .leftJoin(schoolBranches, and(eq(schoolBranches.id, examinations.branchId!), eq(schoolBranches.schoolId, context.schoolId)))
        .where(and(eq(examinations.schoolId, context.schoolId), inArray(examinations.id, ids)))
        .orderBy(asc(examinations.startDate))
      : [];
  }
  exams = exams.filter((exam) =>
    (!branchFilter || exam.branchId === null || exam.branchId === branchFilter) &&
    (!examFilter || exam.id === examFilter),
  );
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
  const examIds = exams.map((exam) => exam.id);
  const assignedSubjectIds = canConfigure || context.grantedPermissions.includes("results.publish")
    ? null
    : examIds.length
      ? (await db.select({ id: examSubjects.id }).from(examSubjects)
        .innerJoin(examClasses, and(
          eq(examClasses.id, examSubjects.examClassId),
          eq(examClasses.schoolId, context.schoolId),
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
          eq(staffMembers.status, "active"),
        ))
        .where(and(
          eq(examSubjects.schoolId, context.schoolId),
          inArray(examClasses.examinationId, examIds),
        ))).map((subject) => subject.id)
      : [];
  const assessmentRows = examIds.length
    ? await db.select({
      id: examSubjects.id,
      examId: examinations.id,
      examName: examinations.name,
      branchId: examinations.branchId,
      classBranchId: classLevels.branchId,
      branchName: schoolBranches.name,
      classLevelId: classLevels.id,
      academicYearId: examinations.academicYearId,
      subjectId: classSubjects.subjectId,
      examTypeName: examTypes.name,
      className: classLevels.name,
      subjectName: subjects.name,
      subjectCode: subjects.code,
      examDate: examSubjects.examDate,
      maxMarks: examSubjects.maxMarks,
      status: examSubjects.status,
    }).from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
      ))
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
      .leftJoin(examTypes, and(
        eq(examTypes.id, examinations.examTypeId!),
        eq(examTypes.schoolId, context.schoolId),
      ))
      .innerJoin(classLevels, and(eq(classLevels.id, examClasses.classLevelId), eq(classLevels.schoolId, context.schoolId)))
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .innerJoin(classSubjects, and(eq(classSubjects.id, examSubjects.classSubjectId), eq(classSubjects.schoolId, context.schoolId)))
      .innerJoin(subjects, and(eq(subjects.id, classSubjects.subjectId), eq(subjects.schoolId, context.schoolId)))
      .where(and(eq(examSubjects.schoolId, context.schoolId), inArray(examinations.id, examIds)))
      .orderBy(asc(examSubjects.examDate), asc(classLevels.name), asc(subjects.name))
    : [];
  const sectionRows = assessmentRows.length
    ? await db.select({
      id: classSections.id,
      classLevelId: classSections.classLevelId,
      academicYearId: classSections.academicYearId,
      name: classSections.name,
    }).from(classSections).where(and(
      eq(classSections.schoolId, context.schoolId),
      inArray(classSections.academicYearId, [...new Set(assessmentRows.map((row) => row.academicYearId))]),
    ))
    : [];
  const authorizedAssessments = assessmentRows.filter((assessment) =>
    canConfigure || context.grantedPermissions.includes("results.publish") || assignedSubjectIds?.includes(assessment.id) === true,
  );
  const filteredAssessments = authorizedAssessments.filter((assessment) =>
    (!branchFilter || assessment.classBranchId === branchFilter) &&
    (!classFilter || assessment.classLevelId === classFilter) &&
    (!subjectFilter || assessment.subjectId === subjectFilter) &&
    (!sectionFilter || sectionRows.some((classSection) =>
      classSection.id === sectionFilter &&
      classSection.classLevelId === assessment.classLevelId &&
      classSection.academicYearId === assessment.academicYearId,
    )),
  );
  const visibleAssessments = filteredAssessments;
  const assessmentIds = visibleAssessments.map((assessment) => assessment.id);
  const markRows = assessmentIds.length
    ? await db.select({
      examSubjectId: examMarks.examSubjectId,
      marks: examMarks.marks,
    }).from(examMarks).where(and(
      eq(examMarks.schoolId, context.schoolId),
      inArray(examMarks.examSubjectId, assessmentIds),
    ))
    : [];
  const attendanceRows = assessmentIds.length
    ? await db.select({
      examSubjectId: examAttendance.examSubjectId,
      status: examAttendance.status,
    }).from(examAttendance).where(and(
      eq(examAttendance.schoolId, context.schoolId),
      inArray(examAttendance.examSubjectId, assessmentIds),
    ))
    : [];
  const classOptions = canConfigure
    ? classes
    : [...new Map(authorizedAssessments.map((assessment) => [assessment.classLevelId, {
      id: assessment.classLevelId,
      name: assessment.className,
      branchId: assessment.classBranchId,
      branchName: assessment.branchName,
    }])).values()];
  const subjectOptions = [...new Map(authorizedAssessments.map((assessment) => [assessment.subjectId, {
    id: assessment.subjectId,
    name: assessment.subjectName,
  }])).values()];
  const sectionOptions = sectionRows.filter((classSection) => authorizedAssessments.some((assessment) =>
    classSection.classLevelId === assessment.classLevelId &&
    classSection.academicYearId === assessment.academicYearId,
  ));
  const assessmentFilterForm = (formSection: "schedule" | "attendance" | "marks") => (
    <form method="get" action="/admin/examinations" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
      <input type="hidden" name="section" value={formSection} />
      <label className="text-sm font-medium">Branch
        <select name="branchId" defaultValue={branchFilter?.toString() ?? ""} className="mt-1 w-full rounded-lg border p-2.5">
          <option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Exam
        <select name="examId" defaultValue={examFilter?.toString() ?? ""} className="mt-1 w-full rounded-lg border p-2.5">
          <option value="">All exams</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Class
        <select name="classLevelId" defaultValue={classFilter?.toString() ?? ""} className="mt-1 w-full rounded-lg border p-2.5">
          <option value="">All classes</option>{classOptions.map((classLevel) => <option key={classLevel.id} value={classLevel.id}>{classLevel.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Section
        <select name="sectionId" defaultValue={sectionFilter?.toString() ?? ""} className="mt-1 w-full rounded-lg border p-2.5">
          <option value="">All sections</option>{sectionOptions.filter((classSection) => !classFilter || classSection.classLevelId === classFilter).map((classSection) => <option key={classSection.id} value={classSection.id}>{classSection.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Subject
        <select name="subjectId" defaultValue={subjectFilter?.toString() ?? ""} className="mt-1 w-full rounded-lg border p-2.5">
          <option value="">All subjects</option>{subjectOptions.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white">Search</button>
        <Link href={`/admin/examinations?section=${formSection}`} className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-slate-700">Reset</Link>
      </div>
    </form>
  );

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-6">
      <header>
        <p className="text-sm font-semibold text-violet-700">{context.schoolName}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">Examinations &amp; results</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">Set up assessments, enter and review marks, then publish complete results and printable report cards. Published marks are locked; corrections are reviewed and retained in the audit history.</p>
      </header>

      <nav aria-label="Examination sections" className="flex flex-wrap gap-2 border-b pb-3">
        {[
          ["types", "Exam Type"],
          ["setup", "Exam Setup"],
          ["schedule", "Exam Schedule"],
          ["attendance", "Exam Attendance"],
          ["marks", "Marks Register"],
          ["grades", "Marks Grade"],
          ["sms", "Send Marks By SMS"],
        ].map(([id, label]) => (
          <Link key={id} href={`/admin/examinations?section=${id}`} aria-current={section === id ? "page" : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${section === id ? "bg-violet-700 text-white" : "bg-white text-slate-600 hover:bg-violet-50 hover:text-violet-800"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {section === "types" && (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {canConfigure && <CreateExamTypeForm branches={branches} />}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">Exam types</h2>
            <p className="mt-1 text-sm text-slate-500">Reusable terms such as First Term, Mid-year, or Final.</p>
            {examTypesList.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Exam type</th><th className="p-3">Branch</th><th className="p-3">Average-passing exam</th><th className="p-3">Average mark</th></tr></thead>
                  <tbody>{examTypesList.map((type) => <tr key={type.id} className="border-t"><td className="p-3 font-semibold">{type.name}</td><td className="p-3">{type.branchName ?? "All branches"}</td><td className="p-3">{type.averagePassing ? "Yes" : "No"}</td><td className="p-3">{type.averageMark}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No exam types have been created.</p>}
          </div>
        </section>
      )}

      {section === "setup" && canConfigure && (
        <CreateExaminationForm years={years} terms={terms} branches={branches} examTypes={examTypesList} scales={scales} classes={classes} today={today} />
      )}

      {section === "setup" && (
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
              <tr><th className="p-4">Examination</th><th className="p-4">Branch</th><th className="p-4">System</th><th className="p-4">Type</th><th className="p-4">Academic year</th><th className="p-4">Dates</th><th className="p-4">Grading scale</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id} className="border-t border-slate-100">
                  <td className="p-4 font-semibold text-slate-900">{exam.name}</td>
                  <td className="p-4">{exam.branchName ?? "All branches"}</td>
                  <td className="p-4">{exam.examSystem === "multi" ? "Multi Exam" : "Single Exam"}</td>
                  <td className="p-4">{exam.examTypeName ?? "Not set"}</td>
                  <td className="p-4">{exam.yearName}</td>
                  <td className="p-4">{exam.startDate} – {exam.endDate}</td>
                  <td className="p-4">{exam.scaleName}</td>
                  <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${exam.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{exam.status}</span></td>
                  <td className="p-4"><Link className="font-semibold text-violet-700 hover:text-violet-900" href={`/admin/examinations/${exam.id}`}>Open examination</Link></td>
                </tr>
              ))}
              {exams.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-slate-500">No examinations are available yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {section === "marks" && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Marks register</h2>
            <p className="mt-1 text-sm text-slate-500">Filter by branch, exam, class, section, and subject, then open a subject roster for bulk component entry or review.</p>
          </div>
          {assessmentFilterForm("marks")}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Branch</th><th className="p-3">Exam</th><th className="p-3">Class</th><th className="p-3">Subject</th><th className="p-3">Maximum marks</th><th className="p-3">Marks entered</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
              <tbody>{visibleAssessments.map((row) => {
                const entered = markRows.filter((mark) => mark.examSubjectId === row.id && mark.marks !== null).length;
                const rosterCount = markRows.filter((mark) => mark.examSubjectId === row.id).length;
                return <tr key={row.id} className="border-t"><td className="p-3">{row.examDate}</td><td className="p-3">{row.branchName ?? "All branches"}</td><td className="p-3">{row.examName}</td><td className="p-3">{row.className}</td><td className="p-3">{row.subjectName} <span className="text-xs text-slate-500">{row.subjectCode}</span></td><td className="p-3">{row.maxMarks}</td><td className="p-3">{entered}/{rosterCount}</td><td className="p-3">{row.status}</td><td className="p-3"><Link className="font-semibold text-violet-700" href={`/admin/examinations/${row.examId}/subjects/${row.id}`}>{row.status === "draft" ? "Add / edit marks" : "View marks"}</Link></td></tr>;
              })}</tbody>
            </table>
          </div>
          {visibleAssessments.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No subject marks registers match these criteria.</p>}
        </section>
      )}

      {section === "grades" && canConfigure && (
        <section className="space-y-4">
          <CreateGradingScaleForm />
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">Grading rules</h2>
            <p className="mt-1 text-sm text-slate-600">A Single Exam has one mark component; Multi Exam adds all component marks and maximums to produce each subject total. Subject percentage = total marks ÷ total maximum × 100. Overall percentage is the weighted mean of each subject percentage using the subject assessment weights. Grades use inclusive lower bounds, with the top band including 100%. Class rank uses competition ranking (tied ranks share a position, the next rank skips).</p>
          </div>
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

      {section === "schedule" && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold text-slate-950">Exam schedule</h2>
          <p className="text-sm text-slate-500">Assessment dates, class, subject, and marks status.</p>
          {assessmentFilterForm("schedule")}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Branch</th><th className="p-3">Exam</th><th className="p-3">Type</th><th className="p-3">Class</th><th className="p-3">Subject</th><th className="p-3">Actions</th></tr></thead>
              <tbody>{visibleAssessments.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{row.examDate}</td><td className="p-3">{row.branchName ?? "All branches"}</td><td className="p-3">{row.examName}</td><td className="p-3">{row.examTypeName ?? "Not set"}</td><td className="p-3">{row.className}</td><td className="p-3">{row.subjectName} <span className="text-xs text-slate-500">{row.subjectCode}</span></td><td className="p-3"><Link className="font-semibold text-violet-700" href={`/admin/examinations/${row.examId}`}>Edit schedule</Link></td></tr>)}</tbody>
            </table>
          </div>
          {visibleAssessments.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No scheduled subjects are available.</p>}
        </section>
      )}

      {section === "attendance" && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold text-slate-950">Exam attendance</h2>
          <p className="text-sm text-slate-500">Select a subject sitting to mark attendance for its enrolled roster.</p>
          {assessmentFilterForm("attendance")}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Branch</th><th className="p-3">Exam</th><th className="p-3">Class</th><th className="p-3">Subject</th><th className="p-3">Recorded</th><th className="p-3">Actions</th></tr></thead>
              <tbody>{visibleAssessments.map((row) => {
                const recorded = attendanceRows.filter((attendance) => attendance.examSubjectId === row.id).length;
                const rosterCount = markRows.filter((mark) => mark.examSubjectId === row.id).length;
                return <tr key={row.id} className="border-t"><td className="p-3">{row.examDate}</td><td className="p-3">{row.branchName ?? "All branches"}</td><td className="p-3">{row.examName}</td><td className="p-3">{row.className}</td><td className="p-3">{row.subjectName}</td><td className="p-3">{recorded}/{rosterCount}</td><td className="p-3"><Link className="font-semibold text-violet-700" href={`/admin/examinations/${row.examId}/attendance/${row.id}`}>Mark attendance</Link></td></tr>;
              })}</tbody>
            </table>
          </div>
          {visibleAssessments.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No exam sittings are available.</p>}
        </section>
      )}

      {section === "sms" && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold text-amber-950">Send marks by SMS</h2>
          <p className="mt-2 text-sm text-amber-900">SMS sending is not enabled. SchoolOS has no configured SMS gateway or delivery provider, so it will not send messages or expose student contact details on this page.</p>
          <p className="mt-2 text-sm text-amber-900">Once a school-approved provider is configured, this section should support a recipient preview, published-results-only selection, explicit confirmation, delivery tracking, and opt-out handling.</p>
        </section>
      )}
    </main>
  );
}
