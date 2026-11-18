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
import { calculateAnnualProgress, calculateWeightedAverage } from "@/lib/examination-policy";
import { schoolLogoSource } from "@/lib/school-logo";
import { ReportSignatureStrip } from "@/app/admin/examinations/signatures/report-signature-strip";

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validId(value: string | undefined): number | null {
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

type ProgressTerm = {
  key: string;
  label: string;
  order: string;
};

type SubjectProgress = {
  subjectId: number;
  subjectName: string;
  termScores: Map<string, { totalMarks: number; maxMarks: number; percentage: number } | null>;
  annualPercentage: number | null;
};

type StudentProgress = {
  studentId: number;
  name: string;
  admissionNumber: string | null;
  sectionName: string;
  rollNumber: string | null;
  subjects: SubjectProgress[];
  termAverages: Map<string, number | null>;
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
    firstName: string;
    lastName: string;
    admissionNumber: string | null;
    sectionName: string;
    rollNumber: string | null;
  }>;
  terms: ProgressTerm[];
  assessments: Array<{
    id: number;
    subjectId: number;
    subjectName: string;
    termKey: string;
    maxMarks: string;
    weight: string;
  }>;
  marks: Array<{ enrollmentId: number; examSubjectId: number; marks: string | null }>;
  studentByEnrollment: Map<number, number>;
}): StudentProgress[] {
  const scores = new Map<number, Map<string, Map<number, Array<{ marks: number; maxMarks: number; weight: number }>>>>();
  const assessmentById = new Map(input.assessments.map((assessment) => [assessment.id, assessment]));
  for (const mark of input.marks) {
    if (mark.marks === null) continue;
    const assessment = assessmentById.get(mark.examSubjectId);
    const studentId = input.studentByEnrollment.get(mark.enrollmentId);
    if (!assessment || studentId === undefined) continue;
    const studentScores = scores.get(studentId) ?? new Map();
    const termScores = studentScores.get(assessment.termKey) ?? new Map();
    const subjectScores = termScores.get(assessment.subjectId) ?? [];
    subjectScores.push({
      marks: Number(mark.marks),
      maxMarks: Number(assessment.maxMarks),
      weight: Number(assessment.weight),
    });
    termScores.set(assessment.subjectId, subjectScores);
    studentScores.set(assessment.termKey, termScores);
    scores.set(studentId, studentScores);
  }

  const subjects = [...new Map(input.assessments.map((assessment) => [
    assessment.subjectId,
    { subjectId: assessment.subjectId, subjectName: assessment.subjectName },
  ])).values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  return input.roster.map((student) => {
    const studentScores = scores.get(student.studentId) ?? new Map();
    const termAverages = new Map<string, number | null>();
    for (const term of input.terms) {
      const termSubjectScores = studentScores.get(term.key);
      const allScores = termSubjectScores ? [...termSubjectScores.values()].flat() : [];
      termAverages.set(
        term.key,
        calculateWeightedAverage(allScores)?.percentage ?? null,
      );
    }

    const subjectRows = subjects.map((subject) => {
      const termScores = new Map<string, { totalMarks: number; maxMarks: number; percentage: number } | null>();
      for (const term of input.terms) {
        const subjectScores = studentScores.get(term.key)?.get(subject.subjectId) ?? [];
        termScores.set(
          term.key,
          calculateWeightedAverage(subjectScores),
        );
      }
      return {
        ...subject,
        termScores,
        annualPercentage: calculateAnnualProgress(
          input.terms.map((term) => termScores.get(term.key)?.percentage ?? null),
        ).average,
      };
    });
    const annualProgress = calculateAnnualProgress(
      input.terms.map((term) => termAverages.get(term.key) ?? null),
    );

    return {
      studentId: student.studentId,
      name: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      sectionName: student.sectionName,
      rollNumber: student.rollNumber,
      subjects: subjectRows,
      termAverages,
      annualAverage: annualProgress.average,
      change: annualProgress.change,
    };
  });
}

function StudentProgressCard({
  student,
  terms,
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
  terms: ProgressTerm[];
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
  return (
    <article className={`a4-report-card space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-slate-900${last ? " a4-report-card-last" : ""}`}>
      <header className="flex items-center gap-4">
        {logo && <Image src={logo} unoptimized width={56} height={56} alt={`${schoolName} logo`} className="h-14 w-14 object-contain" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-wide text-slate-700">{schoolName}</p>
          {(schoolAddress || schoolPhone || schoolEmail) && (
            <p className="mt-0.5 text-xs text-slate-600">{[schoolAddress, schoolPhone, schoolEmail].filter(Boolean).join(" · ")}</p>
          )}
          <h2 className="mt-1 text-xl font-bold">Annual Student Progress Card</h2>
          <p className="mt-1 text-sm text-slate-600">{yearName} · {className}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4">
        <p><b>Student</b><br />{student.name}</p>
        <p><b>Admission no.</b><br />{student.admissionNumber ?? "—"}</p>
        <p><b>Section / roll no.</b><br />{student.sectionName} · {student.rollNumber ?? "—"}</p>
        <p><b>Annual average</b><br />{percentageLabel(student.annualAverage)}</p>
      </section>
      <div className="overflow-x-auto">
        <table className="print-report-table w-full border-collapse text-left text-xs">
          <thead>
            <tr>
              <th>Subject</th>
              {terms.map((term) => <th key={term.key}>{term.label}</th>)}
              <th>Annual average</th>
            </tr>
          </thead>
          <tbody>
            {student.subjects.map((subject) => (
              <tr key={subject.subjectId}>
                <td>{subject.subjectName}</td>
                {terms.map((term) => {
                  const score = subject.termScores.get(term.key);
                  return (
                    <td key={term.key}>
                      {score
                        ? `${score.totalMarks.toFixed(1)} / ${score.maxMarks.toFixed(1)} · ${percentageLabel(score.percentage)}`
                        : "—"}
                    </td>
                  );
                })}
                <td>{percentageLabel(subject.annualPercentage)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td>Overall average</td>
              {terms.map((term) => (
                <td key={term.key}>{percentageLabel(student.termAverages.get(term.key) ?? null)}</td>
              ))}
              <td>{percentageLabel(student.annualAverage)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <section className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        {terms.map((term) => (
          <div key={term.key} className="rounded-lg border border-slate-200 p-3">
            <h3 className="font-bold">{term.label}</h3>
            <p className="mt-1 text-lg font-bold">{percentageLabel(student.termAverages.get(term.key) ?? null)}</p>
          </div>
        ))}
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
          <h3 className="font-bold">Progress change</h3>
          <p className="mt-1 text-lg font-bold">{changeLabel(student.change)}</p>
          <p>First to last term with a published result</p>
        </div>
      </section>
      <ReportSignatureStrip signatures={signatures} />
    </article>
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
      academicTermId: academicTerms.id,
      academicTermName: academicTerms.name,
      termStartDate: academicTerms.startDate,
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
  const termMap = new Map<string, ProgressTerm>();
  const assessments = subjectAssessments.flatMap((assessment) => {
    const examClass = examClassById.get(assessment.examClassId);
    if (!examClass) return [];
    const termKey = examClass.academicTermId === null
      ? `exam:${examClass.examId}`
      : `term:${examClass.academicTermId}`;
    if (!termMap.has(termKey)) {
      termMap.set(termKey, {
        key: termKey,
        label: examClass.academicTermName ?? examClass.examName,
        order: examClass.termStartDate ?? examClass.examStartDate,
      });
    }
    return [{
      ...assessment,
      termKey,
      maxMarks: String(assessment.maxMarks),
      weight: String(assessment.weight),
    }];
  });
  const terms = [...termMap.values()].sort((a, b) => a.order.localeCompare(b.order));
  const rawRoster = selectedYear && selectedClass
    ? await db.select({
      enrollmentId: studentEnrollments.id,
      studentId: students.id,
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
  const roster = [...rosterByStudent.values()];
  const markRows = assessments.length && rawRoster.length
    ? await db.select({
      enrollmentId: examMarks.enrollmentId,
      examSubjectId: examMarks.examSubjectId,
      marks: examMarks.marks,
    }).from(examMarks)
      .where(and(
        eq(examMarks.schoolId, context.schoolId),
        inArray(examMarks.examSubjectId, assessments.map((assessment) => assessment.id)),
        inArray(examMarks.enrollmentId, rawRoster.map((row) => row.enrollmentId)),
      ))
    : [];
  const studentProgress = buildProgressRows({
    roster,
    terms,
    assessments,
    marks: markRows,
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
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Compare published subject results across all terms in an academic year, with annual averages and progress from the first to the latest term.</p>
        </div>
        {selectedYear && selectedClass && visibleProgress.length > 0 && (
          <PrintButton label={selectedStudentId ? "Print progress card / Save PDF" : "Print class progress cards / Save PDF"} targetId="annual-progress-output" pageOrientation="landscape" pageSize="A4" />
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
      {selectedYear && selectedClass && terms.length > 0 && visibleProgress.length > 0 && hasPublishedMarks ? (
        <section id="annual-progress-output" className="print-report-content space-y-5">
          {visibleProgress.map((student, index) => (
            <StudentProgressCard
              key={student.studentId}
              student={student}
              terms={terms}
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
                : terms.length === 0 || !hasPublishedMarks
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
