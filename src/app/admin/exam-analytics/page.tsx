import Image from "next/image";
import type { ReactNode } from "react";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
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
  resolveExamAnalyticsReportView,
  summarizeExamAttendance,
  summarizeExamScores,
  type ExamAnalyticsReportView,
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
  report?: string | string[];
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
  classBranchName: string;
  marks: Map<number, number | null>;
  complete: boolean;
  mean: number | null;
  grade: GradeBand | null;
};

const reportOptions: { value: ExamAnalyticsReportView; label: string; description: string }[] = [
  { value: "overview", label: "Overview", description: "School-wide highlights and score distribution" },
  { value: "classes", label: "Class comparison", description: "Overall class performance and completion" },
  { value: "sections", label: "Section comparison", description: "Compare streams within and across classes" },
  { value: "subjects", label: "Subject analysis", description: "Score coverage, grades, and subject results" },
  { value: "students", label: "Student rankings", description: "Student results across the selected cohort" },
  { value: "attendance", label: "Exam attendance", description: "Coverage and status breakdown by class and section" },
  { value: "trends", label: "Performance trends", description: "Compare published exams in the academic year" },
];

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
  const reportView = resolveExamAnalyticsReportView(first(query.report));
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
    .innerJoin(schoolBranches, and(
      eq(schoolBranches.id, classLevels.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
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
    classBranchName: schoolBranches.name,
  }).from(studentEnrollments)
    .innerJoin(classSections, and(
      eq(classSections.id, studentEnrollments.classSectionId),
      eq(classSections.schoolId, context.schoolId),
    ))
    .innerJoin(classLevels, and(
      eq(classLevels.id, classSections.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(schoolBranches, and(
      eq(schoolBranches.id, classLevels.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
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
  const attendanceRows = reportView === "attendance" && roster.length && assessmentRows.length
    ? await db.select({
      enrollmentId: examAttendance.enrollmentId,
      examSubjectId: examAttendance.examSubjectId,
      status: examAttendance.status,
    }).from(examAttendance).where(and(
      eq(examAttendance.schoolId, context.schoolId),
      inArray(examAttendance.enrollmentId, roster.map((row) => row.enrollmentId)),
      inArray(examAttendance.examSubjectId, assessmentRows.map((row) => row.id)),
    ))
    : [];
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
  type ScoreGroup = {
    branchName: string;
    className: string;
    sectionName?: string;
    scores: number[];
    enrolled: number;
    completed: number;
    passed: number;
  };
  const classPerformance = new Map<number, ScoreGroup>();
  const sectionPerformance = new Map<string, ScoreGroup>();
  for (const row of cohortResults) {
    const classGroup = classPerformance.get(row.classLevelId) ?? {
      branchName: row.classBranchName,
      className: row.className,
      scores: [],
      enrolled: 0,
      completed: 0,
      passed: 0,
    };
    classGroup.enrolled += 1;
    if (row.mean !== null) {
      classGroup.scores.push(row.mean);
      classGroup.completed += 1;
      if (passMark !== null && row.mean >= passMark) classGroup.passed += 1;
    }
    classPerformance.set(row.classLevelId, classGroup);

    const key = `${row.classLevelId}:${row.sectionId}`;
    const group = sectionPerformance.get(key) ?? {
      branchName: row.classBranchName,
      className: row.className,
      sectionName: row.sectionName,
      scores: [],
      enrolled: 0,
      completed: 0,
      passed: 0,
    };
    group.enrolled += 1;
    if (row.mean !== null) {
      group.scores.push(row.mean);
      group.completed += 1;
      if (passMark !== null && row.mean >= passMark) group.passed += 1;
    }
    sectionPerformance.set(key, group);
  }
  const subjectPerformance = assessmentRows.map((assessment) => {
    const relevantResults = cohortResults.filter((row) => row.classLevelId === assessment.classLevelId);
    const subjectScores = relevantResults.flatMap((row) => {
      const marks = row.marks.get(assessment.id);
      return typeof marks === "number" ? [marks / Number(assessment.maxMarks) * 100] : [];
    });
    const subjectGradeDistribution = gradeDistribution(subjectScores, bands);
    const highestGrade = [...bands].sort((a, b) => b.minPercent - a.minPercent)[0]?.grade ?? null;
    return {
      ...assessment,
      summary: summarizeExamScores(subjectScores),
      enrolled: relevantResults.length,
      scoreRate: relevantResults.length ? subjectScores.length / relevantResults.length * 100 : 0,
      highestGrade,
      highestGradeCount: subjectGradeDistribution.find((item) => item.grade === highestGrade)?.count ?? 0,
    };
  });
  const subjectHighlightRows = [...subjectPerformance].sort((a, b) =>
    (b.summary.mean ?? -1) - (a.summary.mean ?? -1) || a.subjectName.localeCompare(b.subjectName),
  );
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
  const attendanceByEnrollmentSubject = new Map<string, string>();
  for (const attendance of attendanceRows) {
    attendanceByEnrollmentSubject.set(`${attendance.enrollmentId}:${attendance.examSubjectId}`, attendance.status);
  }
  type AttendanceGroup = {
    branchName: string;
    className: string;
    sectionName: string;
    assignedSessions: number;
    statuses: string[];
  };
  const attendanceGroups = new Map<string, AttendanceGroup>();
  const overallAttendanceInput = { assignedSessions: 0, statuses: [] as string[] };
  for (const learner of cohortResults) {
    const key = `${learner.classLevelId}:${learner.sectionId}`;
    const group = attendanceGroups.get(key) ?? {
      branchName: learner.classBranchName,
      className: learner.className,
      sectionName: learner.sectionName,
      assignedSessions: 0,
      statuses: [],
    };
    const learnerAssessments = assessmentRows.filter((assessment) => assessment.classLevelId === learner.classLevelId);
    for (const assessment of learnerAssessments) {
      const status = attendanceByEnrollmentSubject.get(`${learner.enrollmentId}:${assessment.id}`);
      group.assignedSessions += 1;
      overallAttendanceInput.assignedSessions += 1;
      if (status) {
        group.statuses.push(status);
        overallAttendanceInput.statuses.push(status);
      }
    }
    attendanceGroups.set(key, group);
  }
  const attendanceSummary = summarizeExamAttendance(
    overallAttendanceInput.assignedSessions,
    overallAttendanceInput.statuses,
  );
  const attendancePerformance = [...attendanceGroups.entries()].map(([key, group]) => ({
    key,
    ...group,
    summary: summarizeExamAttendance(group.assignedSessions, group.statuses),
  }));
  const selectedSubjectIdentity = requestedSubjectId
    ? assessmentRows.find((item) => item.id === requestedSubjectId)?.subjectId ?? null
    : null;
  const trendExamMatches = reportView === "trends" && selectedExam && classLevelIds.length
    ? await db.select({
      id: examinations.id,
      name: examinations.name,
      startDate: examinations.startDate,
    }).from(examinations)
      .innerJoin(examClasses, and(
        eq(examClasses.examinationId, examinations.id),
        eq(examClasses.schoolId, context.schoolId),
        inArray(examClasses.classLevelId, classLevelIds),
      ))
      .where(and(
        eq(examinations.schoolId, context.schoolId),
        eq(examinations.academicYearId, selectedExam.academicYearId),
        eq(examinations.status, "published"),
      ))
      .orderBy(asc(examinations.startDate), asc(examinations.name))
    : [];
  const trendExamRows = [...new Map(trendExamMatches.map((exam) => [exam.id, exam])).values()];
  const trendAssessmentRows = trendExamRows.length
    ? await db.select({
      examId: examClasses.examinationId,
      classLevelId: examClasses.classLevelId,
      examSubjectId: examSubjects.id,
      subjectId: subjects.id,
      maxMarks: examSubjects.maxMarks,
      weight: examSubjects.weight,
    }).from(examSubjects)
      .innerJoin(examClasses, and(
        eq(examClasses.id, examSubjects.examClassId),
        eq(examClasses.schoolId, context.schoolId),
        inArray(examClasses.examinationId, trendExamRows.map((item) => item.id)),
        inArray(examClasses.classLevelId, classLevelIds),
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
      const learnerAssessments = assessments.filter((assessment) => assessment.classLevelId === learner.classLevelId);
      if (!learnerAssessments.length) continue;
      const marks = trendMarks.get(trendExam.id)?.get(learner.enrollmentId);
      if (!marks || !learnerAssessments.every((assessment) => typeof marks.get(assessment.examSubjectId) === "number")) continue;
      const result = calculateWeightedAverage(learnerAssessments.map((assessment) => ({
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
  const classComparisonRows = [...classPerformance.entries()].map(([classLevelId, group]) => ({
    classLevelId,
    ...group,
    summary: summarizeExamScores(group.scores),
  })).sort((a, b) => (b.summary.mean ?? -1) - (a.summary.mean ?? -1) || a.className.localeCompare(b.className));
  const sectionComparisonRows = [...sectionPerformance.entries()].map(([key, group]) => ({
    key,
    ...group,
    summary: summarizeExamScores(group.scores),
  })).sort((a, b) => (b.summary.mean ?? -1) - (a.summary.mean ?? -1) ||
    a.className.localeCompare(b.className) || (a.sectionName ?? "").localeCompare(b.sectionName ?? ""));
  const attendancePerformanceRows = [...attendancePerformance].sort((a, b) =>
    (b.summary.coveragePercent ?? -1) - (a.summary.coveragePercent ?? -1) || a.className.localeCompare(b.className),
  );
  const studentResultRows = [...results].sort((a, b) => {
    if (selectedExam?.allowRanking) {
      if (a.mean === null && b.mean !== null) return 1;
      if (b.mean === null && a.mean !== null) return -1;
      return (a.mean !== null && b.mean !== null ? b.mean - a.mean : 0) ||
        a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    }
    return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
  });
  const studentCsvHeaders = [
    "Student",
    "Admission number",
    "Class",
    "Section",
    "Mean mark (%)",
    "Mean grade",
    ...(selectedExam?.allowRanking ? ["Position"] : []),
    "Result status",
    ...assessmentRows.flatMap((item) => [
      `${item.className} - ${item.subjectName} (%)`,
      `${item.className} - ${item.subjectName} grade`,
      ...(selectedExam?.allowRanking ? [`${item.className} - ${item.subjectName} position`] : []),
    ]),
  ];
  const studentCsvRows = studentResultRows.map((row) => [
    `${row.firstName} ${row.lastName}`,
    row.admissionNumber ?? "",
    row.className,
    row.sectionName,
    row.mean?.toFixed(2) ?? "",
    row.grade?.grade ?? "",
    ...(selectedExam?.allowRanking ? [row.mean === null ? "" : ranks.get(row.enrollmentId) ?? ""] : []),
    row.complete ? "Complete" : "Incomplete",
    ...assessmentRows
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
  const csvOutput = reportView === "classes"
    ? {
      headers: ["Branch", "Class", "Enrolled", "Complete results", "Completion rate (%)", "Mean (%)", "Median (%)", "Highest (%)", "Lowest (%)", ...(passMark === null ? [] : ["At / above threshold"])],
      rows: classComparisonRows.map((item) => [
        item.branchName,
        item.className,
        item.enrolled,
        item.completed,
        item.enrolled ? (item.completed / item.enrolled * 100).toFixed(2) : "0.00",
        item.summary.mean?.toFixed(2) ?? "",
        item.summary.median?.toFixed(2) ?? "",
        item.summary.highest?.toFixed(2) ?? "",
        item.summary.lowest?.toFixed(2) ?? "",
        ...(passMark === null ? [] : [`${item.passed}/${item.completed}`]),
      ]),
    }
    : reportView === "sections"
      ? {
        headers: ["Branch", "Class", "Section", "Enrolled", "Complete results", "Completion rate (%)", "Mean (%)", "Median (%)", "Highest (%)", "Lowest (%)", ...(passMark === null ? [] : ["At / above threshold"])],
        rows: sectionComparisonRows.map((item) => [
          item.branchName,
          item.className,
          item.sectionName ?? "",
          item.enrolled,
          item.completed,
          item.enrolled ? (item.completed / item.enrolled * 100).toFixed(2) : "0.00",
          item.summary.mean?.toFixed(2) ?? "",
          item.summary.median?.toFixed(2) ?? "",
          item.summary.highest?.toFixed(2) ?? "",
          item.summary.lowest?.toFixed(2) ?? "",
          ...(passMark === null ? [] : [`${item.passed}/${item.completed}`]),
        ]),
      }
      : reportView === "subjects"
        ? {
          headers: ["Branch", "Class", "Subject", "Students scored", "Enrolled", "Score coverage (%)", "Mean (%)", "Median (%)", "Highest (%)", "Lowest (%)", "Top grade", "Top grade count"],
          rows: subjectPerformance.map((item) => [
            item.classBranchName,
            item.className,
            item.subjectName,
            item.summary.count,
            item.enrolled,
            item.scoreRate.toFixed(2),
            item.summary.mean?.toFixed(2) ?? "",
            item.summary.median?.toFixed(2) ?? "",
            item.summary.highest?.toFixed(2) ?? "",
            item.summary.lowest?.toFixed(2) ?? "",
            item.highestGrade ?? "",
            item.highestGradeCount,
          ]),
        }
        : reportView === "attendance"
          ? {
            headers: ["Branch", "Class", "Section", "Expected sessions", "Recorded sessions", "Pending sessions", "Coverage (%)", "Present", "Late", "Absent", "Excused", "X", "Y", "Not applicable"],
            rows: attendancePerformanceRows.map((item) => [
              item.branchName,
              item.className,
              item.sectionName,
              item.summary.expectedSessions,
              item.summary.recordedSessions,
              item.summary.pendingSessions,
              item.summary.coveragePercent?.toFixed(2) ?? "",
              item.summary.statuses.present,
              item.summary.statuses.late,
              item.summary.statuses.absent,
              item.summary.statuses.excused,
              item.summary.statuses.x,
              item.summary.statuses.y,
              item.summary.statuses.not_applicable,
            ]),
          }
          : reportView === "trends"
            ? {
              headers: ["Examination", "Date", "Complete results", "Mean (%)", "Median (%)", "Highest (%)", "Lowest (%)", ...(requestedStudentId ? ["Selected student (%)"] : [])],
              rows: performanceTrend.map((item) => [
                item.name,
                item.startDate,
                item.summary.count,
                item.summary.mean?.toFixed(2) ?? "",
                item.summary.median?.toFixed(2) ?? "",
                item.summary.highest?.toFixed(2) ?? "",
                item.summary.lowest?.toFixed(2) ?? "",
                ...(requestedStudentId ? [item.selectedStudentScore?.toFixed(2) ?? ""] : []),
              ]),
            }
            : { headers: studentCsvHeaders, rows: studentCsvRows };
  const schoolLogo = schoolLogoSource(school?.logoUrl ?? null);
  const subjectLabel = requestedSubjectId
    ? assessmentRows.find((item) => item.id === requestedSubjectId)?.subjectName ?? "Selected subject"
    : "All published subjects";
  const studentLabel = requestedStudentId
    ? results[0] ? `${results[0].firstName} ${results[0].lastName}` : "Selected student"
    : "All students";
  const activeReport = reportOptions.find((option) => option.value === reportView) ?? reportOptions[0];

  return (
    <main className="exam-analytics-page exam-report-document space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <p className="text-sm font-semibold text-violet-700">Examinations · Analytics</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Exam Analytics</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Compare published results across classes, streams, subjects, and students. Choose a report view and filters; score calculations follow the selected exam rules.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadAnalyticsCsv
            headers={csvOutput.headers}
            rows={csvOutput.rows}
            fileName={`${(selectedExam?.name ?? "exam").replace(/[^\w-]+/g, "-")}-${reportView}-analytics.csv`}
          />
          <PrintButton
            label={selectedClass ? `Print ${selectedClass.className} PDF report` : "Print analytics PDF report"}
            targetId="exam-analytics-report"
            pageSize="A4"
            pageOrientation="landscape"
          />
        </div>
      </header>

      <SmartFilterForm method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-6 print:hidden">
        <SearchableSelect label="Published examination" name="examId" required
          defaultValue={String(selectedExam?.id ?? "")}
          options={publishedExams.map((exam) => ({ value: String(exam.id), label: `${exam.name} · ${exam.yearName}` }))}
          placeholder="Search examinations..." />
        <SearchableSelect label="Report view" name="report" defaultValue={reportView}
          options={reportOptions.map((option) => ({ value: option.value, label: option.label }))}
          placeholder="Choose a report..." />
        <SearchableSelect label="Class" name="classId" defaultValue={String(selectedClass?.id ?? "")}
          options={[{ value: "", label: "All classes" }, ...classRows.map((item) => ({ value: String(item.id), label: `${item.branchName} · ${item.className}` }))]}
          placeholder="Search classes..." />
        <SearchableSelect label="Section / stream" name="sectionId" defaultValue={String(selectedSection?.id ?? "")}
          options={[{ value: "", label: "All sections" }, ...sectionRows.map((item) => ({ value: String(item.id), label: `${item.className} · ${item.name}` }))]}
          placeholder="Search sections..." />
        <SearchableSelect label="Subject" name="subjectId" defaultValue={String(assessmentRows.find((item) => item.id === requestedSubjectId)?.id ?? "")}
          options={[{ value: "", label: "All subjects" }, ...assessmentRows.map((item) => ({ value: String(item.id), label: `${item.className} · ${item.subjectName}` }))]}
          placeholder="Search subjects..." />
        <SearchableSelect label="Student" name="studentId" defaultValue={String(results.find((row) => row.enrollmentId === requestedStudentId)?.enrollmentId ?? "")}
          options={[{ value: "", label: "All students" }, ...roster.map((row) => ({ value: String(row.enrollmentId), label: `${row.firstName} ${row.lastName} · ${row.className} ${row.sectionName}` }))]}
          placeholder="Search students..." />
        <div className="flex items-end gap-2 xl:col-span-6">
          <button type="submit" className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Apply filters</button>
          <a href="/admin/exam-analytics" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</a>
        </div>
      </SmartFilterForm>

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
              <h2 className="mt-1 text-2xl font-bold">
                {selectedExam?.name}{selectedClass ? ` · ${selectedClass.className}` : ""}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {selectedExam?.yearName} · {selectedExam?.startDate} – {selectedExam?.endDate} · {selectedExam?.scaleName}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {selectedClass?.className ?? "All classes"} · {selectedSection?.name ?? "All sections"} · {subjectLabel} · {studentLabel}
              </p>
              <div className="exam-analytics-report-badges mt-2 flex flex-wrap justify-center gap-2">
                <p className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
                  {activeReport.label}
                </p>
                {selectedClass && reportView !== "overview" && (
                  <p className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    Class report{selectedSection ? ` · ${selectedSection.name}` : " · all sections"}
                  </p>
                )}
              </div>
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

          {reportView === "students" && requestedStudentId && results[0]?.mean !== null && results[0]?.mean !== undefined && (
            <section className="rounded-xl border border-violet-100 bg-violet-50 p-4">
              <h3 className="font-semibold text-violet-950">Student comparison</h3>
              <p className="mt-1 text-sm text-violet-900">
                {results[0].firstName} {results[0].lastName}: <strong>{displayScore(results[0].mean)}</strong>
                  {summary.mean !== null ? ` · cohort mean ${displayScore(summary.mean)} · ${results[0].mean >= summary.mean ? "at or above" : "below"} the cohort mean` : ""}
                  {selectedExam?.allowRanking ? ` · position ${ranks.get(results[0].enrollmentId) ?? "—"} of ${completeResults.length}` : ""}
              </p>
              <p className="mt-1 text-xs text-violet-800">Comparisons need complete results. Grade points aren&apos;t configured for this scale.</p>
            </section>
          )}

          {reportView === "overview" && (
            <div className="grid gap-5 xl:grid-cols-2">
              <AnalyticsPanel title="Grade distribution" description="Complete overall results grouped by the selected grading scale.">
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
              <AnalyticsPanel title="Class highlights" description="Best-performing class means; use Class comparison for the full table.">
                {classComparisonRows.length ? (
                  <div className="space-y-3">
                    {classComparisonRows.slice(0, 5).map((item) => (
                      <div key={item.classLevelId} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.branchName} · {item.className}</p>
                          <ScoreBar value={item.summary.mean} />
                        </div>
                        <p className="text-right text-sm font-bold tabular-nums">{displayScore(item.summary.mean)}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-500">No active class enrollments match these filters.</p>}
              </AnalyticsPanel>
              <AnalyticsPanel title="Section highlights" description="Section means use complete overall student results only.">
                {sectionComparisonRows.length ? (
                  <div className="space-y-3">
                    {sectionComparisonRows.slice(0, 5).map((item) => (
                      <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.className} · {item.sectionName}</p>
                          <ScoreBar value={item.summary.mean} />
                        </div>
                        <p className="text-right text-sm font-bold tabular-nums">{displayScore(item.summary.mean)}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-500">No active section enrollments match these filters.</p>}
              </AnalyticsPanel>
              <AnalyticsPanel title="Subject highlights" description="Subject mean uses students with a recorded numeric mark.">
                {subjectHighlightRows.length ? (
                  <div className="space-y-3">
                    {subjectHighlightRows.slice(0, 5).map((item) => (
                      <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.className} · {item.subjectName}</p>
                          <ScoreBar value={item.summary.mean} />
                        </div>
                        <p className="text-right text-sm font-bold tabular-nums">{displayScore(item.summary.mean)}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-500">No scored subjects match these filters.</p>}
              </AnalyticsPanel>
            </div>
          )}

          {reportView === "classes" && (
            <AnalyticsPanel title="Overall class comparison" description={`Weighted overall mean for each class across its sections. Complete results only; ${passMark === null ? "the exam type has no overall pass threshold." : `the overall pass threshold is ${passMark}%.`}`}>
              {classComparisonRows.length ? (
                <div className="overflow-x-auto">
                  <table className="print-report-table w-full min-w-[920px] border-collapse text-left text-sm">
                    <thead><tr><th>Branch · class</th><th>Mean</th><th>Profile</th><th>Median</th><th>Highest</th><th>Lowest</th><th>Complete</th><th>Completion</th>{passMark !== null && <th>At threshold</th>}</tr></thead>
                    <tbody>{classComparisonRows.map((item) => (
                      <tr key={item.classLevelId}>
                        <td>{item.branchName} · {item.className}</td>
                        <td className="font-semibold">{displayScore(item.summary.mean)}</td>
                        <td><ScoreBar value={item.summary.mean} /></td>
                        <td>{displayScore(item.summary.median)}</td>
                        <td>{displayScore(item.summary.highest)}</td>
                        <td>{displayScore(item.summary.lowest)}</td>
                        <td>{item.completed} / {item.enrolled}</td>
                        <td>{item.enrolled ? `${(item.completed / item.enrolled * 100).toFixed(1)}%` : "—"}</td>
                        {passMark !== null && <td>{item.passed} / {item.completed}</td>}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-500">No active class enrollments match these filters.</p>}
            </AnalyticsPanel>
          )}

          {reportView === "sections" && (
            <AnalyticsPanel title="Class section / stream comparison" description={`Compare weighted overall means for every section. Incomplete results are excluded; ${passMark === null ? "no overall pass threshold is configured." : `the overall pass threshold is ${passMark}%.`}`}>
              {sectionComparisonRows.length ? (
                <div className="overflow-x-auto">
                  <table className="print-report-table w-full min-w-[980px] border-collapse text-left text-sm">
                    <thead><tr><th>Branch · class · section</th><th>Mean</th><th>Profile</th><th>Median</th><th>Range</th><th>Complete</th><th>Completion</th>{passMark !== null && <th>At threshold</th>}</tr></thead>
                    <tbody>{sectionComparisonRows.map((item) => (
                      <tr key={item.key}>
                        <td>{item.branchName} · {item.className} · {item.sectionName}</td>
                        <td className="font-semibold">{displayScore(item.summary.mean)}</td>
                        <td><ScoreBar value={item.summary.mean} /></td>
                        <td>{displayScore(item.summary.median)}</td>
                        <td>{displayScore(item.summary.lowest)}–{displayScore(item.summary.highest)}</td>
                        <td>{item.completed} / {item.enrolled}</td>
                        <td>{item.enrolled ? `${(item.completed / item.enrolled * 100).toFixed(1)}%` : "—"}</td>
                        {passMark !== null && <td>{item.passed} / {item.completed}</td>}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-500">No active section enrollments match these filters.</p>}
            </AnalyticsPanel>
          )}

          {reportView === "subjects" && (
            <AnalyticsPanel title="Subject performance and coverage" description="Scores are normalized to percentages so subjects with different maximum marks can be compared. Highest grade follows the selected grading scale.">
              {subjectPerformance.length ? (
                <div className="overflow-x-auto">
                  <table className="print-report-table w-full min-w-[980px] border-collapse text-left text-sm">
                    <thead><tr><th>Branch · class</th><th>Subject</th><th>Scored / enrolled</th><th>Coverage</th><th>Mean</th><th>Median</th><th>Highest</th><th>Lowest</th><th>Top grade</th></tr></thead>
                    <tbody>{[...subjectPerformance].sort((a, b) =>
                      (b.summary.mean ?? -1) - (a.summary.mean ?? -1) || a.subjectName.localeCompare(b.subjectName),
                    ).map((item) => (
                      <tr key={item.id}>
                        <td>{item.classBranchName} · {item.className}</td>
                        <td>{item.subjectName}<span className="block text-xs text-slate-500">{item.subjectCode}</span></td>
                        <td>{item.summary.count} / {item.enrolled}</td>
                        <td><div className="flex items-center gap-2"><ScoreBar value={item.scoreRate} /><span>{item.scoreRate.toFixed(1)}%</span></div></td>
                        <td className="font-semibold">{displayScore(item.summary.mean)}</td>
                        <td>{displayScore(item.summary.median)}</td>
                        <td>{displayScore(item.summary.highest)}</td>
                        <td>{displayScore(item.summary.lowest)}</td>
                        <td>{item.highestGrade ? `${item.highestGrade} · ${item.highestGradeCount}` : "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-500">No published subject marks match these filters.</p>}
            </AnalyticsPanel>
          )}

          {reportView === "students" && (
            <AnalyticsPanel
              title={requestedStudentId ? "Student result detail" : selectedExam?.allowRanking ? "Student rankings across the selected cohort" : "Student performance"}
              description={selectedExam?.allowRanking
                ? "Overall positions use competition ranking across the selected classes and sections; subject positions are calculated within each class."
                : "This grading scale has ranking disabled; student rows are sorted alphabetically. Incomplete results are not ranked."}
            >
              {studentResultRows.length ? (
                <div className="overflow-x-auto">
                  <table className="print-report-table w-full min-w-[1050px] border-collapse text-left text-sm">
                    <thead><tr>
                      {selectedExam?.allowRanking && <th>Position</th>}
                      <th>Student</th><th>Class / section</th><th>Mean</th><th>Grade</th><th>Completion</th><th>Subjects scored</th><th>Highest subject</th><th>Lowest subject</th>
                      {assessmentRows.map((item) => <th key={item.id}>{item.subjectName}<span className="block text-xs font-normal text-slate-500">Score · Grade · Position</span></th>)}
                    </tr></thead>
                    <tbody>{studentResultRows.map((row) => {
                      const subjectScores = assessmentRows
                        .filter((item) => item.classLevelId === row.classLevelId)
                        .flatMap((item) => {
                          const marks = row.marks.get(item.id);
                          return typeof marks === "number"
                            ? [{ name: item.subjectName, score: marks / Number(item.maxMarks) * 100 }]
                            : [];
                        }).sort((a, b) => b.score - a.score);
                      const bestSubject = subjectScores[0];
                      const lowestSubject = subjectScores[subjectScores.length - 1];
                      return (
                        <tr key={row.enrollmentId}>
                          {selectedExam?.allowRanking && <td>{row.mean === null ? "—" : ranks.get(row.enrollmentId) ?? "—"}</td>}
                          <td>{row.firstName} {row.lastName}<span className="block text-xs text-slate-500">{row.admissionNumber || "—"} · {row.rollNumber || "—"}</span></td>
                          <td>{row.className} · {row.sectionName}</td>
                          <td className="font-semibold">{displayScore(row.mean)}<ScoreBar value={row.mean} /></td>
                          <td>{row.grade ? `${row.grade.grade} · ${row.grade.description}` : "—"}</td>
                          <td>{row.complete ? "Complete" : "Incomplete"}</td>
                          <td>{subjectScores.length} / {assessmentRows.filter((item) => item.classLevelId === row.classLevelId).length}</td>
                          <td>{bestSubject ? `${bestSubject.name} · ${bestSubject.score.toFixed(1)}%` : "—"}</td>
                          <td>{lowestSubject ? `${lowestSubject.name} · ${lowestSubject.score.toFixed(1)}%` : "—"}</td>
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
                      );
                    })}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-500">No active students are enrolled in the selected class / section.</p>}
            </AnalyticsPanel>
          )}

          {reportView === "attendance" && (
            <>
              <section aria-label="Exam attendance summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
                <MetricCard label="Expected subject sessions" value={String(attendanceSummary.expectedSessions)} detail="Not-applicable sessions are excluded" />
                <MetricCard label="Recorded" value={String(attendanceSummary.recordedSessions)} detail="Includes present, late, excused, absent, X, and Y" />
                <MetricCard label="Pending records" value={String(attendanceSummary.pendingSessions)} detail="Expected sessions with no recorded status" />
                <MetricCard label="Recording coverage" value={displayScore(attendanceSummary.coveragePercent)} detail="Recorded / expected sessions" />
              </section>
              <AnalyticsPanel title="Exam attendance by class and section" description="X and Y are recorded separately and are not counted as present. Not-applicable sessions are excluded from coverage.">
                {attendancePerformanceRows.length ? (
                  <div className="overflow-x-auto">
                    <table className="print-report-table w-full min-w-[1040px] border-collapse text-left text-sm">
                      <thead><tr><th>Branch · class · section</th><th>Coverage</th><th>Recorded / expected</th><th>Pending</th><th>Present</th><th>Late</th><th>Absent</th><th>Excused</th><th>X</th><th>Y</th><th>Not applicable</th></tr></thead>
                      <tbody>{attendancePerformanceRows.map((item) => (
                        <tr key={item.key}>
                          <td>{item.branchName} · {item.className} · {item.sectionName}</td>
                          <td>{displayScore(item.summary.coveragePercent)}</td>
                          <td>{item.summary.recordedSessions} / {item.summary.expectedSessions}</td>
                          <td>{item.summary.pendingSessions}</td>
                          <td>{item.summary.statuses.present}</td>
                          <td>{item.summary.statuses.late}</td>
                          <td>{item.summary.statuses.absent}</td>
                          <td>{item.summary.statuses.excused}</td>
                          <td>{item.summary.statuses.x}</td>
                          <td>{item.summary.statuses.y}</td>
                          <td>{item.summary.statuses.not_applicable}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-slate-500">No enrolled students or subject sessions match these filters.</p>}
              </AnalyticsPanel>
            </>
          )}

          {reportView === "trends" && (
            <AnalyticsPanel
              title={requestedStudentId ? "Student and cohort performance trend" : "Academic-year performance trend"}
              description={`Published examinations in ${selectedExam?.yearName}; each student's mean is calculated from that class's same subject set and assessment weights.`}
            >
              {performanceTrend.length ? (
                <div className="overflow-x-auto">
                  <table className="print-report-table w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead><tr><th>Examination</th><th>Cohort mean</th><th>Profile</th>{requestedStudentId && <th>Selected student</th>}<th>Complete results</th><th>Median</th><th>Range</th></tr></thead>
                    <tbody>{performanceTrend.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}<span className="block text-xs text-slate-500">{item.startDate}</span></td>
                        <td className="font-semibold">{displayScore(item.summary.mean)}</td>
                        <td><ScoreBar value={item.summary.mean} /></td>
                        {requestedStudentId && <td>{displayScore(item.selectedStudentScore)}</td>}
                        <td>{item.summary.count}</td>
                        <td>{displayScore(item.summary.median)}</td>
                        <td>{displayScore(item.summary.lowest)}–{displayScore(item.summary.highest)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-500">No published results in this academic year match the selected class / subject.</p>}
            </AnalyticsPanel>
          )}

          <p className="text-xs text-slate-500">
            Results use published marks only. Incomplete overall results are excluded from overall means and ranks; subject summaries use numeric scores entered for that subject.
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

function ScoreBar({ value }: { value: number | null }) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      role="img"
      aria-label={value === null ? "No score" : `${value.toFixed(1)} percent`}
      className="analytics-score-track mt-1 h-2 w-full min-w-20 overflow-hidden rounded-full bg-slate-100"
    >
      <div className="analytics-score-fill h-full rounded-full bg-violet-600" style={{ width: `${width}%` }} />
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
