import Link from "next/link";
import Image from "next/image";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classLevels,
  classSections,
  classSubjects,
  examClasses,
  examAttendance,
  examMarks,
  examReportSignatures,
  examSubjects,
  examinations,
  schoolBranches,
  schools,
  studentEnrollments,
  students,
  subjects,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  buildExamProgressPeriods,
  calculateAnnualProgress,
  calculateWeightedAverage,
  examAssessmentResultState,
  hasCompleteExamResult,
} from "@/lib/examination-policy";
import { schoolLogoSource } from "@/lib/school-logo";
import { ReportSignatureStrip } from "@/app/admin/examinations/signatures/report-signature-strip";

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validId(value: string | undefined): number | null {
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

type ProgressExam = {
  key: string;
  label: string;
  order: string;
};

type SubjectProgress = {
  subjectId: number;
  subjectName: string;
  examScores: Map<string, { totalMarks: number; maxMarks: number; percentage: number } | null>;
  examStatuses: Map<string, string | null>;
  annualPercentage: number | null;
};

type StudentProgress = {
  studentId: number;
  photoUrl: string | null;
  name: string;
  admissionNumber: string | null;
  sectionName: string;
  rollNumber: string | null;
  subjects: SubjectProgress[];
  examAverages: Map<string, number | null>;
  annualAverage: number | null;
  change: number | null;
};

function percentageLabel(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function changeLabel(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pp`;
}

function buildProgressRows(input: {
  roster: Array<{
    studentId: number;
    photoUrl: string | null;
    firstName: string;
    lastName: string;
    admissionNumber: string | null;
    sectionName: string;
    rollNumber: string | null;
  }>;
  exams: ProgressExam[];
  assessments: Array<{
    id: number;
    subjectId: number;
    subjectName: string;
    examKey: string;
    maxMarks: string;
    weight: string;
    isCompulsory: boolean;
  }>;
  marks: Array<{ enrollmentId: number; examSubjectId: number; marks: string | null }>;
  attendance: Array<{ enrollmentId: number; examSubjectId: number; status: string }>;
  studentByEnrollment: Map<number, number>;
}): StudentProgress[] {
  const scores = new Map<number, Map<string, Map<number, Array<{ marks: number; maxMarks: number; weight: number }>>>>();
  const assessmentById = new Map(input.assessments.map((assessment) => [assessment.id, assessment]));
  const attendanceByEnrollment = new Map<number, Map<number, string>>();
  const statusesByStudent = new Map<number, Map<string, Map<number, string>>>();
  for (const attendance of input.attendance) {
    const statuses = attendanceByEnrollment.get(attendance.enrollmentId) ?? new Map<number, string>();
    statuses.set(attendance.examSubjectId, attendance.status);
    attendanceByEnrollment.set(attendance.enrollmentId, statuses);
    const assessment = assessmentById.get(attendance.examSubjectId);
    const studentId = input.studentByEnrollment.get(attendance.enrollmentId);
    if (!assessment || studentId === undefined) continue;
    const studentStatuses = statusesByStudent.get(studentId) ?? new Map<string, Map<number, string>>();
    const examStatuses = studentStatuses.get(assessment.examKey) ?? new Map<number, string>();
    examStatuses.set(assessment.subjectId, attendance.status);
    studentStatuses.set(assessment.examKey, examStatuses);
    statusesByStudent.set(studentId, studentStatuses);
  }
  for (const mark of input.marks) {
    if (mark.marks === null) continue;
    const assessment = assessmentById.get(mark.examSubjectId);
    const studentId = input.studentByEnrollment.get(mark.enrollmentId);
    if (!assessment || studentId === undefined) continue;
    const attendanceStatus = attendanceByEnrollment.get(mark.enrollmentId)?.get(mark.examSubjectId) ?? null;
    if (examAssessmentResultState({
      attendanceStatus,
      isCompulsory: assessment.isCompulsory,
      hasMark: true,
    }) !== "scored") continue;
    const studentScores = scores.get(studentId) ?? new Map();
    const examScores = studentScores.get(assessment.examKey) ?? new Map();
    const subjectScores = examScores.get(assessment.subjectId) ?? [];
    subjectScores.push({
      marks: Number(mark.marks),
      maxMarks: Number(assessment.maxMarks),
      weight: Number(assessment.weight),
    });
    examScores.set(assessment.subjectId, subjectScores);
    studentScores.set(assessment.examKey, examScores);
    scores.set(studentId, studentScores);
  }

  const subjects = [...new Map(input.assessments.map((assessment) => [
    assessment.subjectId,
    { subjectId: assessment.subjectId, subjectName: assessment.subjectName },
  ])).values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  return input.roster.map((student) => {
    const studentScores = scores.get(student.studentId) ?? new Map();
    const examAverages = new Map<string, number | null>();
    for (const exam of input.exams) {
      const examSubjectScores = studentScores.get(exam.key);
      const allScores = examSubjectScores ? [...examSubjectScores.values()].flat() : [];
      const examAssessments = input.assessments.filter((assessment) => assessment.examKey === exam.key);
      const examStates = examAssessments.map((assessment) => {
        const status = statusesByStudent.get(student.studentId)?.get(exam.key)?.get(assessment.subjectId) ?? null;
        const hasMark = (examSubjectScores?.get(assessment.subjectId)?.length ?? 0) > 0;
        return examAssessmentResultState({
          attendanceStatus: status,
          isCompulsory: assessment.isCompulsory,
          hasMark,
        });
      });
      examAverages.set(
        exam.key,
        hasCompleteExamResult(examStates)
          ? calculateWeightedAverage(allScores)?.percentage ?? null
          : null,
      );
    }

    const subjectRows = subjects.map((subject) => {
      const examScores = new Map<string, { totalMarks: number; maxMarks: number; percentage: number } | null>();
      const examStatuses = new Map<string, string | null>();
      for (const exam of input.exams) {
        const subjectScores = studentScores.get(exam.key)?.get(subject.subjectId) ?? [];
        const assessment = input.assessments.find((item) =>
          item.examKey === exam.key && item.subjectId === subject.subjectId,
        );
        const status = statusesByStudent.get(student.studentId)?.get(exam.key)?.get(subject.subjectId) ?? null;
        examStatuses.set(exam.key, status);
        const state = assessment
          ? examAssessmentResultState({
            attendanceStatus: status,
            isCompulsory: assessment.isCompulsory,
            hasMark: subjectScores.length > 0,
          })
          : null;
        examScores.set(
          exam.key,
          state === "scored" ? calculateWeightedAverage(subjectScores) : null,
        );
      }
      const subjectHasNoResult = input.assessments.some((assessment) => {
        if (assessment.subjectId !== subject.subjectId) return false;
        const status = statusesByStudent.get(student.studentId)?.get(assessment.examKey)?.get(subject.subjectId) ?? null;
        const hasMark = (studentScores.get(assessment.examKey)?.get(subject.subjectId)?.length ?? 0) > 0;
        const state = examAssessmentResultState({
          attendanceStatus: status,
          isCompulsory: assessment.isCompulsory,
          hasMark,
        });
        return state === "no-result" || state === "missing";
      });
      return {
        ...subject,
        examScores,
        examStatuses,
        annualPercentage: subjectHasNoResult
          ? null
          : calculateAnnualProgress(
            input.exams.map((exam) => examScores.get(exam.key)?.percentage ?? null),
          ).average,
      };
    });
    const annualProgress = calculateAnnualProgress(
      input.exams.map((exam) => examAverages.get(exam.key) ?? null),
    );

    return {
      studentId: student.studentId,
      photoUrl: student.photoUrl,
      name: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      sectionName: student.sectionName,
      rollNumber: student.rollNumber,
      subjects: subjectRows,
      examAverages,
      annualAverage: annualProgress.average,
      change: annualProgress.change,
    };
  });
}

function StudentProgressCard({
  student,
  exams,
  schoolName,
  schoolLogoUrl,
  schoolAddress,
  schoolEmail,
  schoolPhone,
  yearName,
  className,
  signatures,
  last,
}: {
  student: StudentProgress;
  exams: ProgressExam[];
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolAddress: string | null;
  schoolEmail: string | null;
  schoolPhone: string | null;
  yearName: string;
  className: string;
  signatures: Array<{ role: string; updatedAt: Date }>;
  last: boolean;
}) {
  const logo = schoolLogoSource(schoolLogoUrl);
  const strongestSubjects = student.subjects
    .filter((subject): subject is SubjectProgress & { annualPercentage: number } => subject.annualPercentage !== null)
    .sort((a, b) => b.annualPercentage - a.annualPercentage || a.subjectName.localeCompare(b.subjectName))
    .slice(0, 4);
  const examsWithResults = exams.filter((exam) => typeof student.examAverages.get(exam.key) === "number").length;
  const reportDate = new Date().toISOString().slice(0, 10);
  return (
    <article className={`academic-progress-card annual-progress-card a4-report-card${last ? " a4-report-card-last" : ""}`}>
      <header className="academic-progress-header">
        <div className="academic-progress-brand">
          {logo && <Image src={logo} unoptimized width={76} height={76} alt={`${schoolName} logo`} className="academic-progress-logo" />}
          <div className="academic-progress-school">
            <p>{schoolName}</p>
            <span>{[schoolAddress, schoolPhone, schoolEmail].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <div className="academic-progress-title">
          <h2>Annual Progress Report</h2>
          <p>{yearName} · {className}</p>
          <span>Academic performance report</span>
        </div>
        {student.photoUrl ? (
          <Image src={student.photoUrl} unoptimized width={76} height={88} alt={`${student.name} photo`} className="academic-progress-photo" />
        ) : <div className="academic-progress-photo-placeholder">Student<br />photo</div>}
      </header>
      <section className="academic-progress-overview">
        <div className="academic-progress-student">
          <h3>Student information</h3>
          <AnnualReportField label="Student name" value={student.name} />
          <AnnualReportField label="Admission number" value={student.admissionNumber ?? "—"} />
          <AnnualReportField label="Class / section" value={`${className} · ${student.sectionName}`} />
          <AnnualReportField label="Roll number" value={student.rollNumber ?? "—"} />
          <AnnualReportField label="Academic year" value={yearName} />
          <AnnualReportField label="Report date" value={reportDate} />
          <AnnualReportField label="Exams with results" value={`${examsWithResults} of ${exams.length}`} />
          <AnnualReportField label="Annual average" value={percentageLabel(student.annualAverage)} />
          <AnnualReportField label="Progress change" value={changeLabel(student.change)} />
        </div>
        <div className="academic-progress-performance">
          <div className="academic-progress-section-title">
            <h3>Annual performance profile</h3>
            <span>{examsWithResults} exams with results</span>
          </div>
          <div className="academic-progress-overall">
            <div className="academic-progress-overall-score">
              <span>Annual average</span>
              <strong>{percentageLabel(student.annualAverage)}</strong>
              <span>Across examinations with published results</span>
            </div>
            <div className="academic-progress-grade">
              <span>Change</span>
              <strong>{student.change === null ? "—" : student.change > 0 ? "+" : student.change < 0 ? "−" : "="}</strong>
            </div>
          </div>
          {student.annualAverage !== null && (
            <div className="academic-progress-meter" role="progressbar" aria-label="Annual average" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, student.annualAverage))}>
              <span style={{ width: `${Math.max(0, Math.min(100, student.annualAverage))}%` }} />
            </div>
          )}
          <div className="academic-progress-strengths">
            <h4>Subject performance profile</h4>
            {strongestSubjects.map((subject) => (
              <div className="academic-progress-subject-score" key={subject.subjectId}>
                <span className="academic-progress-subject-name">{subject.subjectName}</span>
                <span className="academic-progress-subject-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, subject.annualPercentage))}%` }} />
                </span>
                <strong>{subject.annualPercentage.toFixed(0)}%</strong>
              </div>
            ))}
            {!strongestSubjects.length && <p className="academic-progress-empty">No subject averages are available.</p>}
          </div>
        </div>
      </section>
      <section className="academic-progress-assessment">
        <h3>Detailed annual assessment</h3>
        <div className="academic-progress-table-wrap">
          <table className="print-report-table">
            <thead>
              <tr>
                <th>Subject</th>
                {exams.map((exam) => <th key={exam.key}>{exam.label}</th>)}
                <th>Annual average</th>
              </tr>
            </thead>
            <tbody>
              {student.subjects.map((subject) => (
                <tr key={subject.subjectId}>
                  <td>{subject.subjectName}</td>
                  {exams.map((exam) => {
                    const score = subject.examScores.get(exam.key);
                    const status = subject.examStatuses.get(exam.key);
                    return (
                      <td key={exam.key}>
                        {score
                          ? `${score.totalMarks.toFixed(1)} / ${score.maxMarks.toFixed(1)} · ${percentageLabel(score.percentage)}`
                          : status === "not_applicable" ? "Not taking"
                          : status === "x" ? "X · No Result"
                          : status === "y" ? "Y · School-defined"
                          : status === "absent" ? "Absent"
                          : status === "excused" ? "Excused"
                          : status === "present" || status === "late" ? "Missing mark"
                          : "—"}
                      </td>
                    );
                  })}
                  <td>{percentageLabel(subject.annualPercentage)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Overall average</td>
                {exams.map((exam) => (
                  <td key={exam.key}>{percentageLabel(student.examAverages.get(exam.key) ?? null)}</td>
                ))}
                <td>{percentageLabel(student.annualAverage)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="academic-progress-comments annual-progress-summaries">
        {exams.map((exam) => (
          <article key={exam.key}>
            <h3>{exam.label}</h3>
            <p>{percentageLabel(student.examAverages.get(exam.key) ?? null)} average</p>
          </article>
        ))}
        <article>
          <h3>Progress change</h3>
          <p>{changeLabel(student.change)} from first to last published exam.</p>
        </article>
      </section>
      <ReportSignatureStrip signatures={signatures} />
    </article>
  );
}

function AnnualReportField({ label, value }: { label: string; value: string }) {
  return (
    <p className="academic-progress-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  );
}

export default async function AnnualProgressCardPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.enter", "results.publish"]);
  const query = await searchParams;
  const canManage = context.grantedPermissions.includes("examinations.create") ||
    context.grantedPermissions.includes("results.publish");
  if (!canManage) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <Link href="/admin/examinations" className="text-sm font-semibold text-violet-700">← Examinations</Link>
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-bold text-amber-950">Whole-class report access required</h1>
          <p className="mt-2 text-sm text-amber-900">Your access is limited to assigned subjects. Ask an examination manager to generate annual class progress cards.</p>
        </section>
      </main>
    );
  }

  const [years, school, signatures] = await Promise.all([
    db.select({ id: academicYears.id, name: academicYears.name, status: academicYears.status, startDate: academicYears.startDate })
      .from(academicYears)
      .where(eq(academicYears.schoolId, context.schoolId))
      .orderBy(desc(academicYears.startDate)),
    db.select({
      name: schools.name,
      logoUrl: schools.logoUrl,
      address: schools.address,
      email: schools.email,
      phone: schools.phone,
    }).from(schools).where(eq(schools.id, context.schoolId)).then((rows) => rows[0]),
    db.select({ role: examReportSignatures.role, updatedAt: examReportSignatures.updatedAt })
      .from(examReportSignatures)
      .where(eq(examReportSignatures.schoolId, context.schoolId)),
  ]);
  const requestedYearId = validId(first(query.academicYearId));
  const selectedYear = years.find((year) => year.id === requestedYearId) ??
    years.find((year) => year.status === "active") ??
    years[0] ??
    null;
  const classRows = selectedYear
    ? await db.select({
      examId: examinations.id,
      examName: examinations.name,
      examStartDate: examinations.startDate,
      academicTermName: academicTerms.name,
      examClassId: examClasses.id,
      classLevelId: classLevels.id,
      className: classLevels.name,
      branchName: schoolBranches.name,
      principalRemark: examClasses.principalRemark,
    }).from(examClasses)
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
        eq(examinations.status, "published"),
        eq(examinations.academicYearId, selectedYear.id),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, examClasses.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .leftJoin(academicTerms, and(
        eq(academicTerms.id, examinations.academicTermId!),
        eq(academicTerms.schoolId, context.schoolId),
      ))
      .where(eq(examClasses.schoolId, context.schoolId))
      .orderBy(asc(examinations.startDate), asc(classLevels.name))
    : [];
  const classOptions = [...new Map(classRows.map((row) => [
    row.classLevelId,
    { id: row.classLevelId, label: `${row.branchName} · ${row.className}` },
  ])).values()];
  const requestedClassId = validId(first(query.classLevelId));
  const selectedClass = classOptions.find((item) => item.id === requestedClassId) ?? classOptions[0] ?? null;
  const selectedClassRows = classRows.filter((row) => row.classLevelId === selectedClass?.id);
  const examClassIds = [...new Set(selectedClassRows.map((row) => row.examClassId))];
  const examClassById = new Map(selectedClassRows.map((row) => [row.examClassId, row]));
  const subjectAssessments = examClassIds.length
    ? await db.select({
      id: examSubjects.id,
      examClassId: examSubjects.examClassId,
      subjectId: subjects.id,
      subjectName: subjects.name,
      maxMarks: examSubjects.maxMarks,
      weight: examSubjects.weight,
      isCompulsory: classSubjects.isCompulsory,
    }).from(examSubjects)
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
        inArray(examSubjects.examClassId, examClassIds),
      ))
      .orderBy(asc(examSubjects.examDate), asc(subjects.name))
    : [];
  const examPeriods = buildExamProgressPeriods(subjectAssessments.flatMap((assessment) => {
    const examClass = examClassById.get(assessment.examClassId);
    return examClass
      ? [{
        examId: examClass.examId,
        examName: examClass.examName,
        termName: examClass.academicTermName,
        startDate: examClass.examStartDate,
      }]
      : [];
  }));
  const examPeriodById = new Map(
    selectedClassRows.map((row) => [row.examId, `exam:${row.examId}`]),
  );
  const assessments = subjectAssessments.flatMap((assessment) => {
    const examClass = examClassById.get(assessment.examClassId);
    if (!examClass) return [];
    return [{
      ...assessment,
      examKey: examPeriodById.get(examClass.examId) ?? `exam:${examClass.examId}`,
      maxMarks: String(assessment.maxMarks),
      weight: String(assessment.weight),
    }];
  });
  const canViewPhotos = context.grantedPermissions.includes("students.view");
  const rawRoster = selectedYear && selectedClass
    ? await db.select({
      enrollmentId: studentEnrollments.id,
      studentId: students.id,
      studentPublicId: students.publicId,
      profilePhoto: students.additionalDetails,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      sectionName: classSections.name,
      rollNumber: studentEnrollments.rollNumber,
    }).from(studentEnrollments)
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
        eq(classSections.classLevelId, selectedClass.id),
        eq(classSections.academicYearId, selectedYear.id),
      ))
      .innerJoin(students, and(
        eq(students.id, studentEnrollments.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.academicYearId, selectedYear.id),
        eq(studentEnrollments.status, "enrolled"),
      ))
      .orderBy(asc(classSections.name), asc(students.lastName), asc(students.firstName))
    : [];
  const rosterByStudent = new Map<number, (typeof rawRoster)[number]>();
  const studentByEnrollment = new Map<number, number>();
  for (const row of rawRoster) {
    studentByEnrollment.set(row.enrollmentId, row.studentId);
    if (!rosterByStudent.has(row.studentId)) rosterByStudent.set(row.studentId, row);
  }
  const roster = [...rosterByStudent.values()].map((row) => ({
    ...row,
    photoUrl: canViewPhotos && row.profilePhoto?.profilePhoto?.objectKey && row.profilePhoto.profilePhoto.fileName
      ? `/api/admin/students/${row.studentPublicId}/photo`
      : null,
  }));
  const [markRows, attendanceRows] = assessments.length && rawRoster.length
    ? await Promise.all([
      db.select({
        enrollmentId: examMarks.enrollmentId,
        examSubjectId: examMarks.examSubjectId,
        marks: examMarks.marks,
      }).from(examMarks)
        .where(and(
          eq(examMarks.schoolId, context.schoolId),
          inArray(examMarks.examSubjectId, assessments.map((assessment) => assessment.id)),
          inArray(examMarks.enrollmentId, rawRoster.map((row) => row.enrollmentId)),
        )),
      db.select({
        enrollmentId: examAttendance.enrollmentId,
        examSubjectId: examAttendance.examSubjectId,
        status: examAttendance.status,
      }).from(examAttendance)
        .where(and(
          eq(examAttendance.schoolId, context.schoolId),
          inArray(examAttendance.examSubjectId, assessments.map((assessment) => assessment.id)),
          inArray(examAttendance.enrollmentId, rawRoster.map((row) => row.enrollmentId)),
        )),
    ])
    : [[], []];
  const studentProgress = buildProgressRows({
    roster,
    exams: examPeriods,
    assessments,
    marks: markRows,
    attendance: attendanceRows,
    studentByEnrollment,
  });
  const requestedStudentId = validId(first(query.studentId));
  const selectedStudentId = studentProgress.some((student) => student.studentId === requestedStudentId)
    ? requestedStudentId
    : null;
  const visibleProgress = selectedStudentId
    ? studentProgress.filter((student) => student.studentId === selectedStudentId)
    : studentProgress;
  const hasPublishedMarks = markRows.some((mark) => mark.marks !== null);

  return (
    <main className="exam-report-document mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <Link href="/admin/examinations" className="text-sm font-semibold text-violet-700">← Examinations</Link>
          <p className="mt-4 text-sm font-semibold text-violet-700">{context.schoolName} · Examination reports</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Annual Progress Card Report</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Compare published results across the year, with averages and progress from first to latest exam.</p>
        </div>
        {selectedYear && selectedClass && visibleProgress.length > 0 && (
          <PrintButton label={selectedStudentId ? "Print progress card / Save PDF" : "Print class progress cards / Save PDF"} targetId="annual-progress-output" pageOrientation="portrait" pageSize="A4" />
        )}
      </header>
      <SmartFilterForm method="get" className="grid max-w-6xl gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <SearchableSelect
          label="Academic year"
          name="academicYearId"
          defaultValue={String(selectedYear?.id ?? "")}
          options={years.map((year) => ({ value: String(year.id), label: `${year.name}${year.status === "active" ? " · current" : ""}` }))}
          placeholder="Search academic years..."
          required
        />
        <SearchableSelect
          label="Class"
          name="classLevelId"
          defaultValue={String(selectedClass?.id ?? "")}
          options={classOptions.map((item) => ({ value: String(item.id), label: item.label }))}
          placeholder="Select a class with published results..."
          required
        />
        <SearchableSelect
          label="Student (optional)"
          name="studentId"
          defaultValue={String(selectedStudentId ?? "")}
          options={[
            { value: "", label: "All students in class" },
            ...studentProgress.map((student) => ({
              value: String(student.studentId),
              label: `${student.name}${student.admissionNumber ? ` · ${student.admissionNumber}` : ""}`,
            })),
          ]}
          placeholder="Search students..."
        />
        <div className="flex items-end gap-2">
          <button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white">Generate report</button>
          <Link href="/admin/examinations/report-center/annual-progress-card" className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-slate-700">Reset</Link>
        </div>
      </SmartFilterForm>
      {selectedYear && selectedClass && examPeriods.length > 0 && visibleProgress.length > 0 && hasPublishedMarks ? (
        <section id="annual-progress-output" className="print-report-content space-y-5">
          {visibleProgress.map((student, index) => (
            <StudentProgressCard
              key={student.studentId}
              student={student}
              exams={examPeriods}
              schoolName={school?.name ?? context.schoolName}
              schoolLogoUrl={school?.logoUrl ?? null}
              schoolAddress={school?.address ?? null}
              schoolEmail={school?.email ?? null}
              schoolPhone={school?.phone ?? null}
              yearName={selectedYear.name}
              className={selectedClass.label}
              signatures={signatures}
              last={index === visibleProgress.length - 1}
            />
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No annual progress cards to show</h2>
          <p className="mt-2 text-sm text-slate-600">
            {!selectedYear
              ? "Create an academic year first."
              : !selectedClass
                ? "There are no classes with published examination results for this academic year."
                : examPeriods.length === 0 || !hasPublishedMarks
                  ? "No published subject results were found for this class."
                  : "No enrolled students were found for this class and academic year."}
          </p>
        </section>
      )}
      <nav aria-label="Other examination reports" className="print:hidden">
        <Link href="/admin/examinations/report-center/progress-card" className="text-sm font-semibold text-violet-700">Open single-examination progress cards →</Link>
      </nav>
    </main>
  );
}
