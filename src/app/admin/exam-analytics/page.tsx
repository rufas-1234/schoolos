import Image from "next/image";
import type { ReactNode } from "react";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  classSubjects,
  examClasses,
  examGradeBands,
  examGradingScales,
  examMarks,
  examSubjects,
  examTypes,
  examinations,
  schoolBranches,
  schools,
  studentEnrollments,
  students,
  subjects,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { calculateWeightedAverage, gradeForPercentage, type GradeBand } from "@/lib/examination-policy";
import {
  analyzeSubjectLearners,
  analyticsRank,
  gradeDistribution,
  summarizeExamScores,
} from "@/lib/exam-analytics-policy";
import { schoolLogoSource } from "@/lib/school-logo";
import { DownloadAnalyticsCsv } from "./download-analytics-csv";

export const dynamic = "force-dynamic";

type Query = {
  examId?: string | string[];
  classId?: string | string[];
  sectionId?: string | string[];
  subjectId?: string | string[];
  studentId?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validId(value: string | undefined): number | null {
  return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}

function displayScore(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function rounded(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

type ScoreRow = {
  enrollmentId: number;
  studentId: number;
  firstName: string;
  lastName: string;
  admissionNumber: string | null;
  rollNumber: string | null;
  sectionId: number;
  sectionName: string;
  classLevelId: number;
  className: string;
  marks: Map<number, number | null>;
  complete: boolean;
  mean: number | null;
  grade: GradeBand | null;
};

export default async function ExamAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.publish"]);
  const query = await searchParams;
  const requestedExamId = validId(first(query.examId));
  const requestedClassId = validId(first(query.classId));
  const requestedSectionId = validId(first(query.sectionId));
  const requestedSubjectId = validId(first(query.subjectId));
  const requestedStudentId = validId(first(query.studentId));
  const [school, publishedExams] = await Promise.all([
    db.select({ name: schools.name, logoUrl: schools.logoUrl })
      .from(schools).where(eq(schools.id, context.schoolId)).limit(1).then((rows) => rows[0]),
    db.select({
      id: examinations.id,
      name: examinations.name,
      status: examinations.status,
      startDate: examinations.startDate,
      endDate: examinations.endDate,
      academicYearId: examinations.academicYearId,
      yearName: academicYears.name,
      gradingScaleId: examinations.gradingScaleId,
      scaleName: examGradingScales.name,
      allowRanking: examGradingScales.allowRanking,
      examTypeName: examTypes.name,
      averagePassing: examTypes.averagePassing,
      averageMark: examTypes.averageMark,
      branchId: examinations.branchId,
      branchName: schoolBranches.name,
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
      .where(and(
        eq(examinations.schoolId, context.schoolId),
        eq(examinations.status, "published"),
      ))
      .orderBy(desc(examinations.startDate), asc(examinations.name)),
  ]);
  const selectedExam = publishedExams.find((exam) => exam.id === requestedExamId) ?? publishedExams[0] ?? null;

  const classRows = selectedExam ? await db.select({
    id: examClasses.id,
    classLevelId: classLevels.id,
    className: classLevels.name,
    branchName: schoolBranches.name,
  }).from(examClasses)
    .innerJoin(classLevels, and(
      eq(classLevels.id, examClasses.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(schoolBranches, and(
      eq(schoolBranches.id, classLevels.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
    ))
    .where(and(
      eq(examClasses.schoolId, context.schoolId),
      eq(examClasses.examinationId, selectedExam.id),
      selectedExam.branchId ? eq(classLevels.branchId, selectedExam.branchId) : undefined,
    ))
    .orderBy(asc(schoolBranches.name), asc(classLevels.name)) : [];
  const selectedClass = classRows.find((item) => item.id === requestedClassId) ?? null;
  const classLevelIds = selectedClass
    ? [selectedClass.classLevelId]
    : [...new Set(classRows.map((item) => item.classLevelId))];

  const sectionRows = selectedExam && classLevelIds.length ? await db.select({
    id: classSections.id,
    name: classSections.name,
    classLevelId: classLevels.id,
    className: classLevels.name,
  }).from(classSections)
    .innerJoin(classLevels, and(
      eq(classLevels.id, classSections.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .where(and(
      eq(classSections.schoolId, context.schoolId),
      eq(classSections.academicYearId, selectedExam.academicYearId),
      inArray(classLevels.id, classLevelIds),
    ))
    .orderBy(asc(classLevels.name), asc(classSections.name)) : [];
  const selectedSection = sectionRows.find((item) => item.id === requestedSectionId) ?? null;

  const assessmentRows = selectedExam && classLevelIds.length ? await db.select({
    id: examSubjects.id,
    classLevelId: classLevels.id,
    className: classLevels.name,
    classBranchName: schoolBranches.name,
    subjectId: subjects.id,
    subjectName: subjects.name,
    subjectCode: subjects.code,
    maxMarks: examSubjects.maxMarks,
    weight: examSubjects.weight,
  }).from(examSubjects)
    .innerJoin(examClasses, and(
      eq(examClasses.id, examSubjects.examClassId),
      eq(examClasses.schoolId, context.schoolId),
    ))
    .innerJoin(classLevels, and(
      eq(classLevels.id, examClasses.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(schoolBranches, and(
      eq(schoolBranches.id, classLevels.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
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
      eq(examSubjects.schoolId, context.schoolId),
      eq(examSubjects.status, "published"),
      eq(examClasses.examinationId, selectedExam.id),
      inArray(classLevels.id, classLevelIds),
      requestedSubjectId ? eq(examSubjects.id, requestedSubjectId) : undefined,
    ))
    .orderBy(asc(classLevels.name), asc(subjects.name)) : [];

  const roster = selectedExam && classLevelIds.length ? await db.select({
    enrollmentId: studentEnrollments.id,
    studentId: students.id,
    firstName: students.firstName,
    lastName: students.lastName,
    admissionNumber: students.admissionNumber,
    rollNumber: studentEnrollments.rollNumber,
    sectionId: classSections.id,
    sectionName: classSections.name,
    classLevelId: classLevels.id,
    className: classLevels.name,
  }).from(studentEnrollments)
    .innerJoin(classSections, and(
      eq(classSections.id, studentEnrollments.classSectionId),
      eq(classSections.schoolId, context.schoolId),
    ))
    .innerJoin(classLevels, and(
      eq(classLevels.id, classSections.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(students, and(
      eq(students.id, studentEnrollments.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .where(and(
      eq(studentEnrollments.schoolId, context.schoolId),
      eq(studentEnrollments.academicYearId, selectedExam.academicYearId),
      eq(studentEnrollments.status, "enrolled"),
      inArray(classLevels.id, classLevelIds),
      selectedSection ? eq(classSections.id, selectedSection.id) : undefined,
    ))
    .orderBy(asc(classLevels.name), asc(classSections.name), asc(students.lastName), asc(students.firstName)) : [];
  const markRows = roster.length && assessmentRows.length ? await db.select({
    enrollmentId: examMarks.enrollmentId,
    examSubjectId: examMarks.examSubjectId,
    marks: examMarks.marks,
  }).from(examMarks).where(and(
    eq(examMarks.schoolId, context.schoolId),
    inArray(examMarks.enrollmentId, roster.map((row) => row.enrollmentId)),
    inArray(examMarks.examSubjectId, assessmentRows.map((row) => row.id)),
  )) : [];
  const gradeRows = selectedExam ? await db.select({
    minPercent: examGradeBands.minPercent,
    maxPercent: examGradeBands.maxPercent,
    grade: examGradeBands.grade,
    description: examGradeBands.description,
    performanceRemark: examGradeBands.performanceRemark,
  }).from(examGradeBands)
    .where(eq(examGradeBands.gradingScaleId, selectedExam.gradingScaleId))
    .orderBy(asc(examGradeBands.sortOrder)) : [];
  const bands: GradeBand[] = gradeRows.map((row) => ({
    minPercent: Number(row.minPercent),
    maxPercent: Number(row.maxPercent),
    grade: row.grade,
    description: row.description,
    performanceRemark: row.performanceRemark,
  }));
  const marksByEnrollment = new Map<number, Map<number, number | null>>();
  for (const mark of markRows) {
    const marks = marksByEnrollment.get(mark.enrollmentId) ?? new Map<number, number | null>();
    marks.set(mark.examSubjectId, mark.marks === null ? null : Number(mark.marks));
    marksByEnrollment.set(mark.enrollmentId, marks);
  }
  const cohortResults: ScoreRow[] = roster.map((row) => {
    const studentAssessments = assessmentRows.filter((assessment) => assessment.classLevelId === row.classLevelId);
    const marks = marksByEnrollment.get(row.enrollmentId) ?? new Map<number, number | null>();
    const complete = studentAssessments.length > 0 &&
      studentAssessments.every((assessment) => typeof marks.get(assessment.id) === "number");
    const mean = complete ? calculateWeightedAverage(studentAssessments.map((assessment) => ({
        marks: Number(marks.get(assessment.id)),
        maxMarks: Number(assessment.maxMarks),
        weight: Number(assessment.weight),
    })))?.percentage ?? null : null;
    if (complete && mean === null) {
      throw new Error(`Invalid published marks found for enrollment ${row.enrollmentId}.`);
    }
    return {
      ...row,
      marks,
      complete,
      mean,
      grade: mean === null ? null : gradeForPercentage(mean, bands),
    };
  });
  const results = cohortResults.filter((row) =>
    !requestedStudentId || row.enrollmentId === requestedStudentId
  );
  const completeResults = cohortResults.filter((row): row is ScoreRow & { mean: number } =>
    row.complete && row.mean !== null
  );
  const scores = completeResults.map((row) => row.mean);
  const summary = summarizeExamScores(scores);
  const distribution = gradeDistribution(scores, bands);
  const ranks = selectedExam?.allowRanking
    ? analyticsRank(completeResults.map((row) => ({ id: row.enrollmentId, score: row.mean })))
    : new Map<number, number>();
  const passMark = selectedExam?.averagePassing ? Number(selectedExam.averageMark) : null;
  const passCount = passMark === null ? null : scores.filter((score) => score >= passMark).length;
  const completionRate = cohortResults.length ? completeResults.length / cohortResults.length * 100 : 0;
  const sectionPerformance = new Map<string, { className: string; sectionName: string; scores: number[]; enrolled: number; completed: number }>();
  for (const row of cohortResults) {
    const key = `${row.classLevelId}:${row.sectionId}`;
    const group = sectionPerformance.get(key) ?? {
      className: row.className,
      sectionName: row.sectionName,
      scores: [],
      enrolled: 0,
      completed: 0,
    };
    group.enrolled += 1;
    if (row.mean !== null) {
      group.scores.push(row.mean);
      group.completed += 1;
    }
    sectionPerformance.set(key, group);
  }
  const subjectPerformance = assessmentRows.map((assessment) => {
    const relevantResults = cohortResults.filter((row) => row.classLevelId === assessment.classLevelId);
    const subjectScores = relevantResults.flatMap((row) => {
      const marks = row.marks.get(assessment.id);
      return typeof marks === "number" ? [marks / Number(assessment.maxMarks) * 100] : [];
    });
    return {
      ...assessment,
      summary: summarizeExamScores(subjectScores),
      enrolled: relevantResults.length,
    };
  });
  const subjectLearnerDetails = new Map<number, Map<number, { grade: string | null; rank: number | null }>>();
  for (const assessment of assessmentRows) {
    const scores = cohortResults.flatMap((row) => {
      const marks = row.marks.get(assessment.id);
      return typeof marks === "number"
        ? [{ id: row.enrollmentId, percentage: marks / Number(assessment.maxMarks) * 100 }]
        : [];
    });
    subjectLearnerDetails.set(
      assessment.id,
      analyzeSubjectLearners(scores, bands, selectedExam?.allowRanking ?? false),
    );
  }
  const selectedSubjectIdentity = requestedSubjectId
    ? assessmentRows.find((item) => item.id === requestedSubjectId)?.subjectId ?? null
    : null;
  const trendExamRows = selectedExam && selectedClass
    ? await db.select({
      id: examinations.id,
      name: examinations.name,
      startDate: examinations.startDate,
    }).from(examinations)
      .innerJoin(examClasses, and(
        eq(examClasses.examinationId, examinations.id),
        eq(examClasses.schoolId, context.schoolId),
        eq(examClasses.classLevelId, selectedClass.classLevelId),
      ))
      .where(and(
        eq(examinations.schoolId, context.schoolId),
        eq(examinations.academicYearId, selectedExam.academicYearId),
        eq(examinations.status, "published"),
      ))
      .orderBy(asc(examinations.startDate), asc(examinations.name))
    : [];
  const trendAssessmentRows = trendExamRows.length
    ? await db.select({
      examId: examClasses.examinationId,
      examSubjectId: examSubjects.id,
      subjectId: subjects.id,
      maxMarks: examSubjects.maxMarks,
      weight: examSubjects.weight,
    }).from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
        inArray(examClasses.examinationId, trendExamRows.map((item) => item.id)),
        eq(examClasses.classLevelId, selectedClass!.classLevelId),
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
        eq(examSubjects.schoolId, context.schoolId),
        eq(examSubjects.status, "published"),
        selectedSubjectIdentity ? eq(subjects.id, selectedSubjectIdentity) : undefined,
      ))
    : [];
  const trendMarkRows = trendAssessmentRows.length && roster.length
    ? await db.select({
      examId: examClasses.examinationId,
      enrollmentId: examMarks.enrollmentId,
      examSubjectId: examMarks.examSubjectId,
      marks: examMarks.marks,
    }).from(examMarks)
      .innerJoin(examSubjects, and(
        eq(examSubjects.id, examMarks.examSubjectId),
        eq(examSubjects.schoolId, context.schoolId),
      ))
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
      ))
      .where(and(
        eq(examMarks.schoolId, context.schoolId),
        inArray(examMarks.enrollmentId, roster.map((item) => item.enrollmentId)),
        inArray(examMarks.examSubjectId, trendAssessmentRows.map((item) => item.examSubjectId)),
      ))
    : [];
  const trendMarks = new Map<number, Map<number, Map<number, number | null>>>();
  for (const mark of trendMarkRows) {
    const examMarksByStudent = trendMarks.get(mark.examId) ?? new Map<number, Map<number, number | null>>();
    const studentMarks = examMarksByStudent.get(mark.enrollmentId) ?? new Map<number, number | null>();
    studentMarks.set(mark.examSubjectId, mark.marks === null ? null : Number(mark.marks));
    examMarksByStudent.set(mark.enrollmentId, studentMarks);
    trendMarks.set(mark.examId, examMarksByStudent);
  }
  const performanceTrend = trendExamRows.flatMap((trendExam) => {
    const assessments = trendAssessmentRows.filter((item) => item.examId === trendExam.id);
    if (!assessments.length) return [];
    const cohortScores: number[] = [];
    let selectedStudentScore: number | null = null;
    for (const learner of roster) {
      const marks = trendMarks.get(trendExam.id)?.get(learner.enrollmentId);
      if (!marks || !assessments.every((assessment) => typeof marks.get(assessment.examSubjectId) === "number")) continue;
      const result = calculateWeightedAverage(assessments.map((assessment) => ({
        marks: Number(marks.get(assessment.examSubjectId)),
        maxMarks: Number(assessment.maxMarks),
        weight: Number(assessment.weight),
      })));
      if (!result) throw new Error(`Invalid published marks found for examination ${trendExam.id}.`);
      cohortScores.push(result.percentage);
      if (learner.enrollmentId === requestedStudentId) selectedStudentScore = result.percentage;
    }
    return [{
      ...trendExam,
      summary: summarizeExamScores(cohortScores),
      selectedStudentScore,
    }];
  });
  const filteredOptions = assessmentRows;
  const csvHeaders = [
    "Student",
    "Admission number",
    "Class",
    "Section",
    "Mean mark (%)",
    "Mean grade",
    ...(selectedExam?.allowRanking ? ["Position"] : []),
    "Result status",
    ...filteredOptions.flatMap((item) => [
      `${item.className} - ${item.subjectName} (%)`,
      `${item.className} - ${item.subjectName} grade`,
      ...(selectedExam?.allowRanking ? [`${item.className} - ${item.subjectName} position`] : []),
    ]),
  ];
  const csvRows = results.map((row) => [
    `${row.firstName} ${row.lastName}`,
    row.admissionNumber ?? "",
    row.className,
    row.sectionName,
    row.mean?.toFixed(2) ?? "",
    row.grade?.grade ?? "",
    ...(selectedExam?.allowRanking ? [row.mean === null ? "" : ranks.get(row.enrollmentId) ?? ""] : []),
    row.complete ? "Complete" : "Incomplete",
    ...filteredOptions
      .filter((item) => item.classLevelId === row.classLevelId)
      .flatMap((item) => {
        const marks = row.marks.get(item.id);
        const detail = subjectLearnerDetails.get(item.id)?.get(row.enrollmentId);
        return [
          typeof marks === "number" ? (marks / Number(item.maxMarks) * 100).toFixed(2) : "",
          detail?.grade ?? "",
          ...(selectedExam?.allowRanking ? [detail?.rank ?? ""] : []),
        ];
      }),
  ]);
  const schoolLogo = schoolLogoSource(school?.logoUrl ?? null);
  const subjectLabel = requestedSubjectId
    ? assessmentRows.find((item) => item.id === requestedSubjectId)?.subjectName ?? "Selected subject"
    : "All published subjects";
  const studentLabel = requestedStudentId
    ? results[0] ? `${results[0].firstName} ${results[0].lastName}` : "Selected student"
    : "All students";

  return (
    <main className="exam-analytics-page exam-report-document space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <p className="text-sm font-semibold text-violet-700">Examinations · Analytics</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Exam Analytics</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Explore published results by examination, class, section, subject, and student. Means and grades use the selected examination&apos;s grading and weighting rules.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadAnalyticsCsv
            headers={csvHeaders}
            rows={csvRows}
            fileName={`${(selectedExam?.name ?? "exam").replace(/[^\w-]+/g, "-")}-analytics.csv`}
          />
          <PrintButton label="Print analytics report" targetId="exam-analytics-report" pageSize="A4" pageOrientation="landscape" />
        </div>
      </header>

      <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-5 print:hidden">
        <label className="text-sm font-medium text-slate-700">Published examination
          <select name="examId" defaultValue={selectedExam?.id ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
            {publishedExams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name} · {exam.yearName}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Class
          <select name="classId" defaultValue={selectedClass?.id ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="">All classes</option>
            {classRows.map((item) => <option key={item.id} value={item.id}>{item.branchName} · {item.className}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Section / stream
          <select name="sectionId" defaultValue={selectedSection?.id ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="">All sections</option>
            {sectionRows.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Subject
          <select name="subjectId" defaultValue={assessmentRows.find((item) => item.id === requestedSubjectId)?.id ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="">All subjects</option>
            {assessmentRows.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.subjectName}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Student
          <select name="studentId" defaultValue={results.find((row) => row.enrollmentId === requestedStudentId)?.enrollmentId ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="">All students</option>
            {roster.map((row) => <option key={row.enrollmentId} value={row.enrollmentId}>{row.firstName} {row.lastName} · {row.className} {row.sectionName}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2 xl:col-span-5">
          <button type="submit" className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Apply filters</button>
          <a href="/admin/exam-analytics" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</a>
        </div>
      </form>

      {!publishedExams.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-bold text-amber-950">No published results yet</h2>
          <p className="mt-2 text-sm text-amber-900">Exam Analytics becomes available once an examination has been published.</p>
        </section>
      ) : (
        <section id="exam-analytics-report" className="print-report-content space-y-6 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
          <header className="print-report-heading flex items-center gap-4">
            {schoolLogo && <Image src={schoolLogo} unoptimized width={64} height={64} alt={`${school?.name ?? context.schoolName} logo`} className="h-16 w-16 object-contain" />}
            <div className="flex-1">
              <p className="print-report-kicker text-sm font-semibold uppercase tracking-wide">{school?.name ?? context.schoolName} · Exam Analytics</p>
              <h2 className="mt-1 text-2xl font-bold">{selectedExam?.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {selectedExam?.yearName} · {selectedExam?.startDate} – {selectedExam?.endDate} · {selectedExam?.scaleName}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {selectedClass?.className ?? "All classes"} · {selectedSection?.name ?? "All sections"} · {subjectLabel} · {studentLabel}
              </p>
            </div>
          </header>

          <section aria-label="Exam summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
            <MetricCard label="Students in comparison cohort" value={String(cohortResults.length)} detail="Active enrollments in selected class / section" />
            <MetricCard label="Complete results" value={`${completeResults.length} / ${cohortResults.length}`} detail={`${completionRate.toFixed(1)}% complete`} />
            <MetricCard label="Mean score" value={summary.mean === null ? "—" : displayScore(summary.mean)} detail={`${summary.count} complete student results`} />
            {passMark !== null
              ? <MetricCard label={`At / above ${passMark}%`} value={`${passCount ?? 0} / ${summary.count}`} detail={summary.count ? `${((passCount ?? 0) / summary.count * 100).toFixed(1)}% of complete results` : "No complete results"} />
              : <MetricCard label="Score range" value={`${rounded(summary.lowest)}–${rounded(summary.highest)}%`} detail={`Median ${rounded(summary.median)}%`} />}
          </section>

          {requestedStudentId && results[0]?.mean !== null && results[0]?.mean !== undefined && (
            <section className="rounded-xl border border-violet-100 bg-violet-50 p-4">
              <h3 className="font-semibold text-violet-950">Student comparison</h3>
              <p className="mt-1 text-sm text-violet-900">
                {results[0].firstName} {results[0].lastName}: <strong>{displayScore(results[0].mean)}</strong>
                  {summary.mean !== null ? ` · cohort mean ${displayScore(summary.mean)} · ${results[0].mean >= summary.mean ? "at or above" : "below"} the cohort mean` : ""}
                  {selectedExam?.allowRanking ? ` · position ${ranks.get(results[0].enrollmentId) ?? "—"} of ${completeResults.length}` : ""}
              </p>
              <p className="mt-1 text-xs text-violet-800">Student comparison uses complete results within the selected filters. Grade points are not configured in this grading scale.</p>
            </section>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <AnalyticsPanel title="Grade distribution" description="Completed student results grouped by the selected examination grading scale.">
              {distribution.length && scores.length ? (
                <div className="space-y-3">
                  {distribution.map((item) => (
                    <div key={item.grade} className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                      <span className="font-semibold">{item.grade}</span>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-violet-600" style={{ width: `${item.count / scores.length * 100}%` }} />
                      </div>
                      <span className="text-right tabular-nums">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No complete scores are available for this selection.</p>}
            </AnalyticsPanel>

            <AnalyticsPanel title="Class and stream comparison" description="Mean result per class section; incomplete results are excluded from means.">
              {sectionPerformance.size ? (
                <div className="overflow-x-auto">
                  <table className="print-report-table w-full min-w-[520px] border-collapse text-left text-sm">
                    <thead><tr><th>Class / section</th><th>Mean</th><th>Complete</th><th>Range</th></tr></thead>
                    <tbody>{[...sectionPerformance.entries()].map(([key, group]) => {
                      const sectionSummary = summarizeExamScores(group.scores);
                      return (
                        <tr key={key}>
                          <td>{group.className} · {group.sectionName}</td>
                          <td>{displayScore(sectionSummary.mean)}</td>
                          <td>{group.completed} / {group.enrolled}</td>
                          <td>{rounded(sectionSummary.lowest)}–{rounded(sectionSummary.highest)}%</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-500">No active student enrollments match these filters.</p>}
            </AnalyticsPanel>
          </div>

          {selectedClass && (
            <AnalyticsPanel
              title={requestedStudentId ? "Student and class performance trend" : "Class performance trend"}
              description={`Complete published results across ${selectedExam?.yearName}; this trend uses the same class and ${selectedSubjectIdentity ? "subject" : "all published subjects"} for a fair percentage comparison.`}
            >
              {performanceTrend.length ? (
                <div className="overflow-x-auto">
                  <table className="print-report-table w-full min-w-[560px] border-collapse text-left text-sm">
                    <thead><tr><th>Examination</th><th>Class mean</th>{requestedStudentId && <th>Student mean</th>}<th>Complete results</th><th>Score profile</th></tr></thead>
                    <tbody>{performanceTrend.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}<span className="block text-xs text-slate-500">{item.startDate}</span></td>
                        <td>{displayScore(item.summary.mean)}</td>
                        {requestedStudentId && <td>{displayScore(item.selectedStudentScore)}</td>}
                        <td>{item.summary.count}</td>
                        <td>
                          {item.summary.mean === null
                            ? "—"
                            : <div className="h-3 min-w-32 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-violet-600" style={{ width: `${item.summary.mean}%` }} />
                            </div>}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-500">No published results are available for this class and subject combination.</p>}
            </AnalyticsPanel>
          )}

          <AnalyticsPanel title="Subject performance" description="Mean percentage is calculated from students with a mark for that subject.">
            {subjectPerformance.length ? (
              <div className="overflow-x-auto">
                <table className="print-report-table w-full min-w-[620px] border-collapse text-left text-sm">
                  <thead><tr><th>Class</th><th>Subject</th><th>Students scored</th><th>Mean</th><th>Median</th><th>Highest</th><th>Lowest</th></tr></thead>
                  <tbody>{subjectPerformance.map((item) => (
                    <tr key={item.id}>
                      <td>{item.classBranchName} · {item.className}</td>
                      <td>{item.subjectName}<span className="block text-xs text-slate-500">{item.subjectCode}</span></td>
                      <td>{item.summary.count} / {item.enrolled}</td>
                      <td>{displayScore(item.summary.mean)}</td>
                      <td>{displayScore(item.summary.median)}</td>
                      <td>{displayScore(item.summary.highest)}</td>
                      <td>{displayScore(item.summary.lowest)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500">No published subject marks match these filters.</p>}
          </AnalyticsPanel>

          <AnalyticsPanel title={requestedStudentId ? "Student result detail" : "Student performance report"} description="Subject grades use the selected examination grading scale. Subject positions use competition ranking when enabled and reflect the selected class / section cohort. Missing marks remain visible as incomplete.">
            {results.length ? (
              <div className="overflow-x-auto">
                <table className="print-report-table w-full min-w-[780px] border-collapse text-left text-sm">
                  <thead><tr>
                    {selectedExam?.allowRanking && <th>Position</th>}
                    <th>Student</th><th>Class / section</th><th>Mean</th><th>Grade</th><th>Completion</th>
                    {assessmentRows.map((item) => <th key={item.id}>{item.subjectName}<span className="block text-xs font-normal text-slate-500">Score · Grade · Position</span></th>)}
                  </tr></thead>
                  <tbody>{[...results].sort((a, b) => {
                    if (a.mean === null && b.mean !== null) return 1;
                    if (b.mean === null && a.mean !== null) return -1;
                    return (a.mean !== null && b.mean !== null ? b.mean - a.mean : 0) ||
                      a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
                  }).map((row) => (
                    <tr key={row.enrollmentId}>
                      {selectedExam?.allowRanking && <td>{row.mean === null ? "—" : ranks.get(row.enrollmentId) ?? "—"}</td>}
                      <td>{row.firstName} {row.lastName}<span className="block text-xs text-slate-500">{row.admissionNumber || "—"} · {row.rollNumber || "—"}</span></td>
                      <td>{row.className} · {row.sectionName}</td>
                      <td className="font-semibold">{displayScore(row.mean)}</td>
                      <td>{row.grade ? `${row.grade.grade} · ${row.grade.description}` : "—"}</td>
                      <td>{row.complete ? "Complete" : "Incomplete"}</td>
                      {assessmentRows.map((item) => {
                        const marks = row.marks.get(item.id);
                        const detail = subjectLearnerDetails.get(item.id)?.get(row.enrollmentId);
                        return (
                          <td key={item.id}>
                            {typeof marks === "number" ? (
                              <>
                                <span>{displayScore(marks / Number(item.maxMarks) * 100)}</span>
                                <span className="block text-xs text-slate-500">
                                  {detail?.grade ?? "Ungraded"}
                                  {detail?.rank !== null && detail?.rank !== undefined ? ` · #${detail.rank}` : ""}
                                </span>
                              </>
                            ) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500">No active students are enrolled in the selected class / section.</p>}
          </AnalyticsPanel>

          <p className="text-xs text-slate-500">
            Incomplete student results are excluded from mean, grade, and rank calculations. Subject scores are normalized to percentages; overall means use each subject&apos;s configured weight. This report is based on published marks only.
          </p>
        </section>
      )}
    </main>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function AnalyticsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="print-report-panel overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 p-4">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
