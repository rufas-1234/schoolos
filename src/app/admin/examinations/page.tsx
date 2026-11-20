import Link from "next/link";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classSections,
  classLevels,
  classSubjects,
  examClasses,
  examAttendance,
  examComponents,
  examGradeBands,
  examGradingScales,
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
import { canViewExamSubject } from "@/lib/examination-policy";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";
import {
  CreateExamTypeForm,
  CreateExaminationForm,
  CreateGradingScaleForm,
  EditGradingScaleForm,
  DeleteExaminationForm,
} from "./examination-forms";

export const dynamic = "force-dynamic";

export default async function ExaminationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string;
    branchId?: string;
    examId?: string;
    editExam?: string;
    saved?: string;
    classLevelId?: string;
    sectionId?: string;
    subjectId?: string;
    search?: string;
  }>;
}) {
  const context = await requireSchoolPermission(["examinations.create", "results.enter", "results.publish"]);
  const {
    section: requestedSection,
    branchId: rawBranchId,
    examId: rawExamId,
    editExam: rawEditExamId,
    saved: savedStatus,
    classLevelId: rawClassLevelId,
    sectionId: rawSectionId,
    subjectId: rawSubjectId,
    search: rawSearch,
  } = await searchParams;
  const search = rawSearch?.trim().slice(0, 120) ?? "";
  const normalizedSearch = search.toLocaleLowerCase();
  const branchFilter = rawBranchId && /^\d+$/.test(rawBranchId) ? Number(rawBranchId) : null;
  const examFilter = rawExamId && /^\d+$/.test(rawExamId) ? Number(rawExamId) : null;
  const editExamId = rawEditExamId && /^\d+$/.test(rawEditExamId) ? Number(rawEditExamId) : null;
  const classFilter = rawClassLevelId && /^\d+$/.test(rawClassLevelId) ? Number(rawClassLevelId) : null;
  const sectionFilter = rawSectionId && /^\d+$/.test(rawSectionId) ? Number(rawSectionId) : null;
  const subjectFilter = rawSubjectId && /^\d+$/.test(rawSubjectId) ? Number(rawSubjectId) : null;
  const section = ["types", "setup", "schedule", "attendance", "marks", "grades", "sms"].includes(requestedSection ?? "")
    ? requestedSection!
    : "setup";
  const sectionTitles: Record<string, string> = {
    types: "Exam Type",
    setup: "Exam Setup",
    schedule: "Exam Schedule",
    attendance: "Exam Attendance",
    marks: "Marks Register",
    grades: "Marks Grade",
    sms: "Send Marks By SMS",
  } as const;
  const canConfigure = context.grantedPermissions.includes("examinations.create");
  const canDeleteExaminations = context.grantedPermissions.includes("examinations.delete");
  const canPublish = context.grantedPermissions.includes("results.publish");
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
  const isManager = canConfigure || canPublish;
  const userTeacherIds = !isManager
    ? (await db.select({ id: teachers.id }).from(teachers)
      .innerJoin(staffMembers, and(
        eq(staffMembers.id, teachers.staffMemberId!),
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.linkedUserId, context.user.id),
        eq(staffMembers.status, "active"),
      ))
      .where(and(eq(teachers.schoolId, context.schoolId), eq(teachers.status, "active"))))
      .map((teacher) => teacher.id)
    : [];
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
    const classTeacherAssignments = userTeacherIds.length
      ? await db.selectDistinct({ examId: examinations.id }).from(classSections)
        .innerJoin(examClasses, and(
          eq(examClasses.classLevelId, classSections.classLevelId),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .innerJoin(examinations, and(
          eq(examinations.id, examClasses.examinationId),
          eq(examinations.academicYearId, classSections.academicYearId),
          eq(examinations.schoolId, context.schoolId),
        ))
        .where(and(
          eq(classSections.schoolId, context.schoolId),
          inArray(classSections.classTeacherId, userTeacherIds),
        ))
      : [];
    const ids = [...new Set([
      ...assignments.map((entry) => entry.examId),
      ...classTeacherAssignments.map((entry) => entry.examId),
    ])];
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
  const [editExam] = canConfigure && section === "setup" && editExamId
    ? await db.select({
      id: examinations.id,
      name: examinations.name,
      branchId: examinations.branchId,
      examSystem: examinations.examSystem,
      startDate: examinations.startDate,
      endDate: examinations.endDate,
      academicYearId: examinations.academicYearId,
      academicTermId: examinations.academicTermId,
    }).from(examinations).where(and(
      eq(examinations.id, editExamId),
      eq(examinations.schoolId, context.schoolId),
    )).limit(1)
    : [];
  const editClassRows = editExam
    ? await db.select({
      classLevelId: examClasses.classLevelId,
      className: classLevels.name,
    }).from(examClasses).innerJoin(classLevels, and(
      eq(classLevels.id, examClasses.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    )).where(and(
      eq(examClasses.schoolId, context.schoolId),
      eq(examClasses.examinationId, editExam.id),
    ))
    : [];
  const editSubjectRows = editExam
    ? await db.select({ id: examSubjects.id }).from(examSubjects).innerJoin(examClasses, and(
      eq(examClasses.id, examSubjects.examClassId),
      eq(examClasses.schoolId, context.schoolId),
    )).where(and(
      eq(examClasses.examinationId, editExam.id),
      eq(examSubjects.schoolId, context.schoolId),
    ))
    : [];
  const editComponents = editSubjectRows.length
    ? await db.select({
      title: examComponents.title,
      maxMarks: examComponents.maxMarks,
    }).from(examComponents).where(and(
      eq(examComponents.schoolId, context.schoolId),
      eq(examComponents.examSubjectId, editSubjectRows[0].id),
    )).orderBy(asc(examComponents.sortOrder))
    : [];
  const editRecord = editExam && editComponents.length
    ? {
      ...editExam,
      classNames: editClassRows.map((row) => row.className),
      components: editComponents.map((component) => ({
        title: component.title,
        maxMarks: Number(component.maxMarks),
      })),
    }
    : undefined;
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
  let assignedSubjectIds: number[] | null = null;
  if (!isManager) {
    const assignedSubjects = examIds.length
      ? await db.select({ id: examSubjects.id }).from(examSubjects)
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
        ))
      : [];
    const classTeacherSubjects = examIds.length && userTeacherIds.length
      ? await db.selectDistinct({ id: examSubjects.id }).from(examSubjects)
        .innerJoin(examClasses, and(
          eq(examClasses.id, examSubjects.examClassId),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .innerJoin(examinations, and(
          eq(examinations.id, examClasses.examinationId),
          eq(examinations.schoolId, context.schoolId),
        ))
        .innerJoin(classSections, and(
          eq(classSections.classLevelId, examClasses.classLevelId),
          eq(classSections.academicYearId, examinations.academicYearId),
          eq(classSections.schoolId, context.schoolId),
          inArray(classSections.classTeacherId, userTeacherIds),
        ))
        .where(and(
          eq(examSubjects.schoolId, context.schoolId),
          inArray(examClasses.examinationId, examIds),
        ))
      : [];
    assignedSubjectIds = [...new Set([
      ...assignedSubjects.map((subject) => subject.id),
      ...classTeacherSubjects.map((subject) => subject.id),
    ])];
  }
  const assessmentRows = examIds.length
    ? await db.select({
      id: examSubjects.id,
      examId: examinations.id,
      examClassId: examClasses.id,
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
    canViewExamSubject(context.grantedPermissions, assignedSubjectIds?.includes(assessment.id) ?? false),
  );
  const filteredAssessments = authorizedAssessments.filter((assessment) =>
    (!branchFilter || assessment.classBranchId === branchFilter) &&
    (!classFilter || assessment.classLevelId === classFilter) &&
    (!subjectFilter || assessment.subjectId === subjectFilter) &&
    (!normalizedSearch || `${assessment.examName} ${assessment.className} ${assessment.subjectName} ${assessment.subjectCode ?? ""}`.toLocaleLowerCase().includes(normalizedSearch)) &&
    (!sectionFilter || sectionRows.some((classSection) =>
      classSection.id === sectionFilter &&
      classSection.classLevelId === assessment.classLevelId &&
      classSection.academicYearId === assessment.academicYearId,
    )),
  );
  const visibleAssessments = filteredAssessments;
  const assessmentIds = visibleAssessments.map((assessment) => assessment.id);
  const assessmentComponents = assessmentIds.length
    ? await db.select({
      examSubjectId: examComponents.examSubjectId,
      title: examComponents.title,
      maxMarks: examComponents.maxMarks,
      sortOrder: examComponents.sortOrder,
    }).from(examComponents).where(and(
      eq(examComponents.schoolId, context.schoolId),
      inArray(examComponents.examSubjectId, assessmentIds),
    )).orderBy(asc(examComponents.examSubjectId), asc(examComponents.sortOrder))
    : [];
  const componentRowsBySubject = new Map<number, typeof assessmentComponents>();
  for (const component of assessmentComponents) {
    const rows = componentRowsBySubject.get(component.examSubjectId) ?? [];
    rows.push(component);
    componentRowsBySubject.set(component.examSubjectId, rows);
  }
  const markRows = assessmentIds.length
    ? await db.select({
      examSubjectId: examMarks.examSubjectId,
      marks: examMarks.marks,
    }).from(examMarks).where(and(
      eq(examMarks.schoolId, context.schoolId),
      inArray(examMarks.examSubjectId, assessmentIds),
    ))
    : [];
  const attendanceRosterRows = visibleAssessments.length
    ? await db.select({
      enrollmentId: studentEnrollments.id,
      classLevelId: classSections.classLevelId,
      academicYearId: classSections.academicYearId,
    }).from(studentEnrollments)
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(students, and(
        eq(students.id, studentEnrollments.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.status, "enrolled"),
        ne(students.status, "disabled"),
        inArray(classSections.classLevelId, [...new Set(visibleAssessments.map((row) => row.classLevelId))]),
        inArray(classSections.academicYearId, [...new Set(visibleAssessments.map((row) => row.academicYearId))]),
      ))
    : [];
  const attendanceRosterBySubjectId = new Map(visibleAssessments.map((assessment) => [
    assessment.id,
    attendanceRosterRows.filter((enrollment) =>
      enrollment.classLevelId === assessment.classLevelId &&
      enrollment.academicYearId === assessment.academicYearId,
    ),
  ]));
  const attendanceRows = assessmentIds.length
    ? await db.select({
      examSubjectId: examAttendance.examSubjectId,
      enrollmentId: examAttendance.enrollmentId,
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
    <SmartFilterForm method="get" action="/admin/examinations" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      <input type="hidden" name="section" value={formSection} />
      <label className="min-w-0 text-sm font-medium">Search
        <input type="search" name="search" defaultValue={search} maxLength={120} placeholder="Exam, class, subject" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      </label>
      <SearchableSelect label="Branch" name="branchId" defaultValue={branchFilter?.toString() ?? ""}
        options={[{ value: "", label: "All branches" }, ...branches.map((branch) => ({ value: String(branch.id), label: branch.name }))]}
        placeholder="Search branches..." />
      <SearchableSelect label="Exam" name="examId" defaultValue={examFilter?.toString() ?? ""}
        options={[{ value: "", label: "All exams" }, ...exams.map((exam) => ({ value: String(exam.id), label: exam.name }))]}
        placeholder="Search exams..." />
      <SearchableSelect label="Class" name="classLevelId" defaultValue={classFilter?.toString() ?? ""}
        options={[{ value: "", label: "All classes" }, ...classOptions.map((classLevel) => ({ value: String(classLevel.id), label: classLevel.name }))]}
        placeholder="Search classes..." />
      <SearchableSelect label="Section" name="sectionId" defaultValue={sectionFilter?.toString() ?? ""}
        options={[{ value: "", label: "All sections" }, ...sectionOptions.filter((classSection) => !classFilter || classSection.classLevelId === classFilter).map((classSection) => ({ value: String(classSection.id), label: classSection.name }))]}
        placeholder="Search sections..." />
      <SearchableSelect label="Subject" name="subjectId" defaultValue={subjectFilter?.toString() ?? ""}
        options={[{ value: "", label: "All subjects" }, ...subjectOptions.map((subject) => ({ value: String(subject.id), label: subject.name }))]}
        placeholder="Search subjects..." />
      <div className="flex items-end gap-2">
        <button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white">Search</button>
        <Link href={`/admin/examinations?section=${formSection}`} className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-slate-700">Reset</Link>
      </div>
    </SmartFilterForm>
  );

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-6">
      <header>
        <p className="text-sm font-semibold text-violet-700">{context.schoolName} · Examinations</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">{sectionTitles[section]}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          {section === "setup"
            ? "Add an exam, set its mark distributions, and manage it from the exam list below."
            : "This section is separate from the other examination features. Choose another item from the Examinations menu on the left."}
        </p>
      </header>

      {section === "types" && (
        <section className="space-y-5">
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

      {section === "setup" && canConfigure && editRecord && (
        <section className="space-y-4">
          <Link href="/admin/examinations?section=setup" className="text-sm font-semibold text-violet-700">← Back to Exam List</Link>
          <CreateExaminationForm key={editRecord.id} years={years} terms={terms} branches={branches} classes={classes} today={today} record={editRecord} />
        </section>
      )}

      {section === "setup" && !editRecord && (
      <section className="space-y-8">
        {savedStatus === "1" && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Exam changes saved.</p>}
        {canConfigure && <CreateExaminationForm years={years} terms={terms} branches={branches} classes={classes} today={today} />}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-950">Exam List</h2>
            <p className="text-sm text-slate-500">{isManager ? "Examinations for your school" : "Examinations containing your assigned subjects"}</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="p-4">SL</th><th className="p-4">Branch</th><th className="p-4">Exam title</th><th className="p-4">Class / section</th><th className="p-4">Subject</th><th className="p-4">Total mark</th><th className="p-4">Mark distribution</th><th className="p-4">Action</th></tr>
            </thead>
            <tbody>
              {exams.map((exam, index) => {
                const examAssessments = visibleAssessments.filter((assessment) => assessment.examId === exam.id);
                const canEdit = exam.status === "open" &&
                  examAssessments.length > 0 &&
                  examAssessments.every((assessment) => assessment.status === "draft");
                const classNames = [...new Set(examAssessments.map((assessment) => assessment.className))];
                const sectionNames = [...new Set(examAssessments.flatMap((assessment) => sectionRows
                  .filter((classSection) => classSection.classLevelId === assessment.classLevelId && classSection.academicYearId === assessment.academicYearId)
                  .map((classSection) => `${assessment.className} ${classSection.name}`)))];
                const canDelete = exam.status === "open" &&
                  examAssessments.length > 0 &&
                  examAssessments.every((assessment) => assessment.status === "draft") &&
                  !markRows.some((mark) => examAssessments.some((assessment) => assessment.id === mark.examSubjectId) && mark.marks !== null) &&
                  !attendanceRows.some((attendance) => examAssessments.some((assessment) => assessment.id === attendance.examSubjectId));
                return (
                  <tr key={exam.id} className="border-t border-slate-100 align-top">
                    <td className="p-4">{index + 1}</td>
                    <td className="p-4">{exam.branchName ?? "All branches"}</td>
                    <td className="p-4">
                      <p className="font-semibold text-slate-900">{exam.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{exam.examSystem === "multi" ? "Multi Exam" : "Single Exam"} · {exam.yearName} · {exam.startDate} – {exam.endDate} · {exam.status}</p>
                    </td>
                    <td className="p-4">{sectionNames.length ? sectionNames.join(", ") : classNames.join(", ") || "—"}</td>
                    <td className="p-4">
                      {examAssessments.length
                        ? <ul className="space-y-1">{examAssessments.map((assessment) => <li key={assessment.id}>{assessment.subjectName}</li>)}</ul>
                        : "—"}
                    </td>
                    <td className="p-4">
                      {examAssessments.length
                        ? <ul className="space-y-1">{examAssessments.map((assessment) => <li key={assessment.id}>{assessment.maxMarks}</li>)}</ul>
                        : "—"}
                    </td>
                    <td className="p-4">
                      {examAssessments.length
                        ? <ul className="space-y-1">{examAssessments.map((assessment) => (
                          <li key={assessment.id}>{(componentRowsBySubject.get(assessment.id) ?? []).map((component) => `${component.title}: ${component.maxMarks}`).join(", ") || "—"}</li>
                        ))}</ul>
                        : "—"}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" href={`/admin/examinations/${exam.id}`}>View</Link>
                        {canConfigure && <>
                          {canEdit && <Link className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-50" href={`/admin/examinations?section=setup&editExam=${exam.id}`}>Edit</Link>}
                          {canDeleteExaminations && (
                            <DeleteExaminationForm examinationId={exam.id} examinationName={exam.name} disabled={!canDelete} />
                          )}
                        </>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {exams.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-slate-500">No examinations are available yet.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      </section>
      )}

      {section === "marks" && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Marks register</h2>
            <p className="mt-1 text-sm text-slate-500">Filter by branch, exam, class, section, or subject; open a roster to enter or review marks.</p>
            {!isManager && <p className="mt-1 text-sm text-violet-700">Only assigned subjects are shown. Ask an administrator for exam setup or Results publish access to see more.</p>}
          </div>
          {assessmentFilterForm("marks")}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Branch</th><th className="p-3">Exam</th><th className="p-3">Class</th><th className="p-3">Subject</th><th className="p-3">Maximum marks</th><th className="p-3">Marks entered</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
              <tbody>{visibleAssessments.map((row) => {
                const entered = markRows.filter((mark) => mark.examSubjectId === row.id && mark.marks !== null).length;
                const rosterCount = markRows.filter((mark) => mark.examSubjectId === row.id).length;
                const attendanceRoster = attendanceRosterBySubjectId.get(row.id) ?? [];
                const attendanceIds = new Set(attendanceRows
                  .filter((attendance) => attendance.examSubjectId === row.id)
                  .map((attendance) => attendance.enrollmentId));
                const hasRoster = attendanceRoster.length > 0;
                const attendanceComplete = hasRoster &&
                  attendanceRoster.every((enrollment) => attendanceIds.has(enrollment.enrollmentId));
                const needsAttendance = hasRoster && !attendanceComplete;
                const actionHref = needsAttendance && row.status === "draft"
                  ? `/admin/examinations/${row.examId}/attendance/${row.id}`
                  : `/admin/examinations/${row.examId}/subjects/${row.id}`;
                const actionLabel = needsAttendance && row.status === "draft"
                  ? "Take attendance"
                  : hasRoster && row.status === "draft"
                    ? "Add / edit marks"
                    : hasRoster ? "View marks" : "View roster";
                return <tr key={row.id} className="border-t"><td className="p-3">{row.examDate}</td><td className="p-3">{row.branchName ?? "All branches"}</td><td className="p-3">{row.examName}</td><td className="p-3">{row.className}</td><td className="p-3">{row.subjectName} <span className="text-xs text-slate-500">{row.subjectCode}</span></td><td className="p-3">{row.maxMarks}</td><td className="p-3">{entered}/{rosterCount}</td><td className="p-3">{!hasRoster ? "No roster" : attendanceComplete ? row.status : "Attendance required"}</td><td className="p-3"><Link className="font-semibold text-violet-700" href={actionHref}>{actionLabel}</Link></td></tr>;
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
            <p className="mt-1 text-sm text-slate-600">Single uses one component; Multi sums them. Overall results use subject weights; grades and ranks follow school rules.</p>
          </div>
          <h2 className="text-xl font-bold text-slate-950">Configured grading scales</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {scalesWithBands.map((scale) => (
              <article key={scale.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-2"><h3 className="font-bold">{scale.name}</h3>{scale.isDefault && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">Default</span>}</div>
                <p className="mt-1 text-xs text-slate-500">Class ranking {scale.allowRanking ? "enabled" : "disabled"}</p>
                <div className="mt-3 flex flex-wrap gap-2">{scale.bands.map((band) => <span key={band.grade} className="rounded-lg bg-slate-50 px-3 py-2 text-xs"><b>{band.grade}</b> {band.min}%–{band.max}% · {band.description}</span>)}</div>
                <EditGradingScaleForm scale={{
                  ...scale,
                  bands: scale.bands.map((band) => ({
                    minPercent: Number(band.min),
                    maxPercent: Number(band.max),
                    grade: band.grade,
                    description: band.description,
                    performanceRemark: band.remark,
                  })),
                }} />
              </article>
            ))}
          </div>
        </section>
      )}

      {section === "schedule" && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold text-slate-950">Exam schedule</h2>
          <p className="text-sm text-slate-500">Review assessment dates, classes, subjects, and marks status. Create exams in Exam Setup and edit their schedules here.</p>
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
                const roster = attendanceRosterBySubjectId.get(row.id) ?? [];
                const rosterIds = new Set(roster.map((enrollment) => enrollment.enrollmentId));
                const recorded = attendanceRows.filter((attendance) =>
                  attendance.examSubjectId === row.id && rosterIds.has(attendance.enrollmentId),
                ).length;
                const rosterCount = roster.length;
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
          <p className="mt-2 text-sm text-amber-900">SMS is disabled until a gateway is configured. No messages are sent or student contacts shown.</p>
          <p className="mt-2 text-sm text-amber-900">SMS delivery features require a school-approved provider.</p>
        </section>
      )}
    </main>
  );
}
