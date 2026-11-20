import Link from "next/link";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { BookOpenCheck, CalendarDays, ClipboardCheck, UsersRound } from "lucide-react";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classRooms,
  classRoutines,
  classSections,
  classSubjects,
  examClasses,
  examMarks,
  examSubjects,
  examTypes,
  examinations,
  schoolBranches,
  studentAttendance,
  studentEnrollments,
  students,
  staffMembers,
  subjects,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { isAttendanceStatus } from "@/lib/attendance-policy";
import { matchesTeacherExamAssessment } from "@/lib/teacher-portal-policy";
import { PrintButton } from "@/components/print-button";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { TeacherPortalShell } from "./teacher-portal-shell";
import { TeacherClassAttendance } from "./teacher-class-attendance";
import { ReviewSubjectForm } from "@/app/admin/examinations/examination-forms";

export const dynamic = "force-dynamic";

const weekdays = new Map([
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
]);

const sectionTitles: Record<string, string> = {
  classes: "My classes",
  register: "Class register & attendance",
  assessments: "Examination work",
  timetable: "My timetable",
};

export default async function TeacherPortalPage({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string | string[];
    q?: string | string[];
    status?: string | string[];
    examTitle?: string | string[];
    sectionId?: string | string[];
    classLevelId?: string | string[];
    classSectionId?: string | string[];
    attendanceDate?: string | string[];
  }>;
}) {
  const context = await requireSchoolPermission("results.enter");
  const params = await searchParams;
  const sectionParam = typeof params.section === "string" ? params.section : "overview";
  const activeSection = ["overview", "classes", "register", "assessments", "timetable"].includes(sectionParam)
    ? sectionParam
    : "overview";
  const showOverview = activeSection === "overview";
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const normalizedSearch = search.toLocaleLowerCase();
  const assessmentStatusFilter = ["open", "published"].includes(typeof params.status === "string" ? params.status : "")
    ? params.status as "open" | "published"
    : "";
  const requestedExamTitle = typeof params.examTitle === "string" ? params.examTitle : "";
  const assessmentTitleFilter = /^\d+$/.test(requestedExamTitle) ? requestedExamTitle : "";
  const requestedAssessmentSectionId = typeof params.sectionId === "string" ? params.sectionId : "";
  const assessmentSectionFilter = /^\d+$/.test(requestedAssessmentSectionId) && Number.isSafeInteger(Number(requestedAssessmentSectionId))
    ? Number(requestedAssessmentSectionId)
    : null;
  const requestedClassLevelId = typeof params.classLevelId === "string" ? params.classLevelId : "";
  const assessmentClassFilter = /^\d+$/.test(requestedClassLevelId) && Number.isSafeInteger(Number(requestedClassLevelId))
    ? Number(requestedClassLevelId)
    : null;
  const requestedSectionId = typeof params.classSectionId === "string" && /^\d+$/.test(params.classSectionId)
    ? Number(params.classSectionId)
    : null;
  const requestedDate = typeof params.attendanceDate === "string" && isCalendarDate(params.attendanceDate)
    ? params.attendanceDate
    : new Date().toISOString().slice(0, 10);
  const teacherRecords = await db.select({
    id: teachers.id,
    firstName: teachers.firstName,
    lastName: teachers.lastName,
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
    ));
  const teacherIds = [...new Set(teacherRecords.map((teacher) => teacher.id))];
  const teacherName = teacherRecords.length
    ? [...new Set(teacherRecords.map((teacher) => `${teacher.firstName} ${teacher.lastName}`))].join(" · ")
    : context.user.name;

  const [assignments, routines, assessmentRows, classTeacherSections] = teacherIds.length
    ? await Promise.all([
      showOverview || activeSection === "classes" ? db.select({
        className: classLevels.name,
        sectionName: classSections.name,
        yearName: academicYears.name,
        branchName: schoolBranches.name,
        subjectName: subjects.name,
        subjectCode: subjects.code,
      }).from(classSubjects)
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
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSubjects.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
          eq(classLevels.status, "active"),
        ))
        .innerJoin(subjects, and(
          eq(subjects.id, classSubjects.subjectId),
          eq(subjects.schoolId, context.schoolId),
        ))
        .innerJoin(classSections, and(
          eq(classSections.classLevelId, classLevels.id),
          eq(classSections.schoolId, context.schoolId),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, classSections.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ))
        .innerJoin(schoolBranches, and(
          eq(schoolBranches.id, classLevels.branchId),
          eq(schoolBranches.schoolId, context.schoolId),
        ))
        .where(and(
          eq(classSubjects.schoolId, context.schoolId),
          inArray(classSubjects.teacherId, teacherIds),
        ))
        .orderBy(asc(classLevels.name), asc(classSections.name), asc(subjects.name)) : Promise.resolve([]),
      showOverview || activeSection === "timetable" ? db.select({
        dayOfWeek: classRoutines.dayOfWeek,
        startsAt: classRoutines.startsAt,
        endsAt: classRoutines.endsAt,
        className: classLevels.name,
        sectionName: classSections.name,
        subjectName: subjects.name,
        roomNumber: classRooms.roomNumber,
      }).from(classRoutines)
        .innerJoin(classSubjects, and(
          eq(classSubjects.id, classRoutines.classSubjectId),
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
        .innerJoin(subjects, and(
          eq(subjects.id, classSubjects.subjectId),
          eq(subjects.schoolId, context.schoolId),
        ))
        .innerJoin(classSections, and(
          eq(classSections.id, classRoutines.classSectionId),
          eq(classSections.schoolId, context.schoolId),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
          eq(classLevels.status, "active"),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, classSections.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ))
        .leftJoin(classRooms, and(
          eq(classRooms.id, classRoutines.classRoomId!),
          eq(classRooms.schoolId, context.schoolId),
        ))
        .where(and(
          eq(classRoutines.schoolId, context.schoolId),
          inArray(classSubjects.teacherId, teacherIds),
        ))
        .orderBy(asc(classRoutines.dayOfWeek), asc(classRoutines.startsAt)) : Promise.resolve([]),
      showOverview || activeSection === "assessments" ? db.select({
        examId: examinations.id,
        examClassId: examClasses.id,
        assessmentId: examSubjects.id,
        examName: examinations.name,
        examTypeId: examTypes.id,
        examTypeName: examTypes.name,
        examStatus: examinations.status,
        assessmentStatus: examSubjects.status,
        examDate: examSubjects.examDate,
        classLevelId: classLevels.id,
        className: classLevels.name,
        subjectName: subjects.name,
        yearName: academicYears.name,
      }).from(examSubjects)
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
        .innerJoin(examClasses, and(
          eq(examClasses.id, examSubjects.examClassId),
          eq(examClasses.schoolId, context.schoolId),
        ))
        .innerJoin(examinations, and(
          eq(examinations.id, examClasses.examinationId),
          eq(examinations.schoolId, context.schoolId),
          inArray(examinations.status, ["open", "published"]),
        ))
        .leftJoin(examTypes, and(
          eq(examTypes.id, examinations.examTypeId!),
          eq(examTypes.schoolId, context.schoolId),
        ))
        .innerJoin(academicYears, and(
          eq(academicYears.id, examinations.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, examClasses.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
          eq(classLevels.status, "active"),
        ))
        .innerJoin(subjects, and(
          eq(subjects.id, classSubjects.subjectId),
          eq(subjects.schoolId, context.schoolId),
        ))
        .where(and(
          eq(examSubjects.schoolId, context.schoolId),
          inArray(classSubjects.teacherId, teacherIds),
        ))
        .orderBy(asc(examSubjects.examDate), asc(classLevels.name), asc(subjects.name)) : Promise.resolve([]),
      showOverview || activeSection === "register" ? db.select({
        id: classSections.id,
        academicYearId: classSections.academicYearId,
        classLevelId: classSections.classLevelId,
        branchId: classLevels.branchId,
        sectionName: classSections.name,
        className: classLevels.name,
        branchName: schoolBranches.name,
        yearName: academicYears.name,
      }).from(classSections)
        .innerJoin(academicYears, and(
          eq(academicYears.id, classSections.academicYearId),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ))
        .innerJoin(classLevels, and(
          eq(classLevels.id, classSections.classLevelId),
          eq(classLevels.schoolId, context.schoolId),
          eq(classLevels.status, "active"),
        ))
        .innerJoin(schoolBranches, and(
          eq(schoolBranches.id, classLevels.branchId),
          eq(schoolBranches.schoolId, context.schoolId),
        ))
        .where(and(
          eq(classSections.schoolId, context.schoolId),
          inArray(classSections.classTeacherId, teacherIds),
        ))
        .orderBy(asc(academicYears.startDate), asc(classLevels.name), asc(classSections.name)) : Promise.resolve([]),
    ])
    : [[], [], [], []];

  const assessmentExamClassIds = [...new Set(assessmentRows.map((assessment) => assessment.examClassId))];
  const assessmentSectionRows = assessmentExamClassIds.length
    ? await db.select({
      examClassId: examClasses.id,
      sectionId: classSections.id,
      sectionName: classSections.name,
      className: classLevels.name,
    }).from(examClasses)
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, examClasses.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(classSections, and(
        eq(classSections.classLevelId, examClasses.classLevelId),
        eq(classSections.academicYearId, examinations.academicYearId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .where(and(
        eq(examClasses.schoolId, context.schoolId),
        inArray(examClasses.id, assessmentExamClassIds),
      ))
      .orderBy(asc(classLevels.name), asc(classSections.name))
    : [];
  const sectionsByExamClass = new Map<number, Array<{ id: number; name: string }>>();
  for (const section of assessmentSectionRows) {
    const options = sectionsByExamClass.get(section.examClassId) ?? [];
    options.push({ id: section.sectionId, name: section.sectionName });
    sectionsByExamClass.set(section.examClassId, options);
  }
  const assessmentSections = [...new Map(assessmentSectionRows.map((section) => [
    section.sectionId,
    { id: section.sectionId, label: `${section.className} · ${section.sectionName}` },
  ])).values()].sort((a, b) => a.label.localeCompare(b.label));
  const assessments = assessmentRows.map((assessment) => {
    const sections = sectionsByExamClass.get(assessment.examClassId) ?? [];
    return {
      ...assessment,
      sectionIds: sections.map((section) => section.id),
      sectionNames: sections.map((section) => section.name),
    };
  });

  const classTeacherExamRows = teacherIds.length && (showOverview || activeSection === "assessments")
    ? await db.selectDistinct({
      examClassId: examClasses.id,
      classTeacherId: examClasses.classTeacherId,
      examId: examinations.id,
      examName: examinations.name,
      examStatus: examinations.status,
      yearName: academicYears.name,
      className: classLevels.name,
    }).from(examClasses)
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
        eq(examinations.status, "open"),
      ))
      .innerJoin(academicYears, and(
        eq(academicYears.id, examinations.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
        eq(academicYears.status, "active"),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, examClasses.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
        eq(classLevels.status, "active"),
      ))
      .leftJoin(classSections, and(
        eq(classSections.classLevelId, examClasses.classLevelId),
        eq(classSections.academicYearId, examinations.academicYearId),
        eq(classSections.schoolId, context.schoolId),
        inArray(classSections.classTeacherId, teacherIds),
      ))
      .where(and(
        eq(examClasses.schoolId, context.schoolId),
        or(
          inArray(examClasses.classTeacherId, teacherIds),
          isNotNull(classSections.id),
        ),
      ))
      .orderBy(asc(examinations.startDate), asc(classLevels.name))
    : [];
  const classTeacherExamClassIds = classTeacherExamRows.map((row) => row.examClassId);
  const classTeacherSubjectStatuses = classTeacherExamClassIds.length
    ? await db.select({
      examClassId: examSubjects.examClassId,
      examSubjectId: examSubjects.id,
      subjectName: subjects.name,
      status: examSubjects.status,
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
        inArray(examSubjects.examClassId, classTeacherExamClassIds),
      ))
    : [];
  const classTeacherProgress = new Map<number, { total: number; submitted: number; approved: number; published: number }>();
  for (const subject of classTeacherSubjectStatuses) {
    const progress = classTeacherProgress.get(subject.examClassId) ?? { total: 0, submitted: 0, approved: 0, published: 0 };
    progress.total += 1;
    if (subject.status === "submitted") progress.submitted += 1;
    if (subject.status === "approved") progress.approved += 1;
    if (subject.status === "published") progress.published += 1;
    classTeacherProgress.set(subject.examClassId, progress);
  }

  const uniqueAssignments = [...new Map(assignments.map((assignment) => [
    `${assignment.yearName}:${assignment.className}:${assignment.sectionName}:${assignment.subjectName}`,
    assignment,
  ])).values()];
  const hasTeacherProfile = teacherRecords.length > 0;
  const selectedClassSection = activeSection === "register"
    ? classTeacherSections.find((section) => section.id === requestedSectionId)
    : undefined;
  const roster = selectedClassSection
    ? await db.select({
      id: students.id,
      enrollmentId: studentEnrollments.id,
      firstName: students.firstName,
      lastName: students.lastName,
      branchId: students.branchId,
      admissionNumber: students.admissionNumber,
      rollNumber: studentEnrollments.rollNumber,
      attendanceStatus: studentAttendance.status,
      attendanceNote: studentAttendance.note,
    }).from(studentEnrollments)
      .innerJoin(students, and(
        eq(students.id, studentEnrollments.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .leftJoin(studentAttendance, and(
        eq(studentAttendance.enrollmentId, studentEnrollments.id),
        eq(studentAttendance.classSectionId, selectedClassSection.id),
        eq(studentAttendance.attendanceDate, requestedDate),
        eq(studentAttendance.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.classSectionId, selectedClassSection.id),
        eq(studentEnrollments.academicYearId, selectedClassSection.academicYearId),
        eq(studentEnrollments.status, "enrolled"),
        ne(students.status, "disabled"),
      ))
      .orderBy(asc(students.lastName), asc(students.firstName))
    : [];
  const publishedReportExamClasses = selectedClassSection
    ? await db.select({
      examClassId: examClasses.id,
      examId: examinations.id,
      examName: examinations.name,
      branchId: examinations.branchId,
    }).from(examClasses)
      .innerJoin(examinations, and(
        eq(examinations.id, examClasses.examinationId),
        eq(examinations.schoolId, context.schoolId),
        eq(examinations.academicYearId, selectedClassSection.academicYearId),
        eq(examinations.status, "published"),
        or(isNull(examinations.branchId), eq(examinations.branchId, selectedClassSection.branchId)),
      ))
      .where(and(
        eq(examClasses.schoolId, context.schoolId),
        eq(examClasses.classLevelId, selectedClassSection.classLevelId),
      ))
      .orderBy(asc(examinations.startDate), asc(examinations.name))
    : [];
  const publishedSubjects = publishedReportExamClasses.length
    ? await db.select({
      id: examSubjects.id,
      examClassId: examSubjects.examClassId,
    }).from(examSubjects)
      .where(and(
        eq(examSubjects.schoolId, context.schoolId),
        eq(examSubjects.status, "published"),
        inArray(examSubjects.examClassId, publishedReportExamClasses.map((examClass) => examClass.examClassId)),
      ))
    : [];
  const publishedMarks = publishedSubjects.length && roster.length
    ? await db.select({
      enrollmentId: examMarks.enrollmentId,
      examSubjectId: examMarks.examSubjectId,
      marks: examMarks.marks,
    }).from(examMarks)
      .where(and(
        eq(examMarks.schoolId, context.schoolId),
        inArray(examMarks.examSubjectId, publishedSubjects.map((subject) => subject.id)),
        inArray(examMarks.enrollmentId, roster.map((student) => student.enrollmentId)),
      ))
    : [];
  const subjectIdsByExamClass = new Map<number, number[]>();
  for (const subject of publishedSubjects) {
    const ids = subjectIdsByExamClass.get(subject.examClassId) ?? [];
    ids.push(subject.id);
    subjectIdsByExamClass.set(subject.examClassId, ids);
  }
  const completeMarkKeys = new Set(
    publishedMarks.filter((mark) => mark.marks !== null).map((mark) => `${mark.enrollmentId}:${mark.examSubjectId}`),
  );
  const publishedReportsByEnrollment = new Map<number, { examId: number; examName: string }[]>();
  for (const examClass of publishedReportExamClasses) {
    const subjectIds = subjectIdsByExamClass.get(examClass.examClassId) ?? [];
    if (!subjectIds.length) continue;
    for (const student of roster) {
      if (examClass.branchId !== null && examClass.branchId !== student.branchId) continue;
      if (!subjectIds.every((subjectId) => completeMarkKeys.has(`${student.enrollmentId}:${subjectId}`))) continue;
      const reports = publishedReportsByEnrollment.get(student.enrollmentId) ?? [];
      reports.push({ examId: examClass.examId, examName: examClass.examName });
      publishedReportsByEnrollment.set(student.enrollmentId, reports);
    }
  }
  const historyStartDate = new Date(`${requestedDate}T00:00:00.000Z`);
  historyStartDate.setUTCDate(historyStartDate.getUTCDate() - 29);
  const historyStart = historyStartDate.toISOString().slice(0, 10);
  const historyRows = roster.length && selectedClassSection
    ? await db.select({
      studentId: studentAttendance.studentId,
      status: studentAttendance.status,
    }).from(studentAttendance)
      .where(and(
        eq(studentAttendance.schoolId, context.schoolId),
        eq(studentAttendance.classSectionId, selectedClassSection.id),
        inArray(studentAttendance.studentId, roster.map((student) => student.id)),
        gte(studentAttendance.attendanceDate, historyStart),
        lte(studentAttendance.attendanceDate, requestedDate),
      ))
    : [];
  const recentAbsences = new Map<number, number>();
  for (const row of historyRows) {
    if (row.status === "absent") recentAbsences.set(row.studentId, (recentAbsences.get(row.studentId) ?? 0) + 1);
  }
  const attendanceRoster = roster.map((student) => ({
    id: student.id,
    enrollmentId: student.enrollmentId,
    firstName: student.firstName,
    lastName: student.lastName,
    admissionNumber: student.admissionNumber,
    rollNumber: student.rollNumber,
    status: student.attendanceStatus && isAttendanceStatus(student.attendanceStatus) ? student.attendanceStatus : null,
    note: student.attendanceNote,
    absencesInLast30Days: recentAbsences.get(student.id) ?? 0,
    publishedReports: publishedReportsByEnrollment.get(student.enrollmentId) ?? [],
  }));
  const attendanceSections = classTeacherSections.map((section) => ({
    id: section.id,
    label: `${section.branchName} · ${section.yearName} · ${section.className} · ${section.sectionName}`,
  }));
  const selectedAttendanceSectionId = selectedClassSection ? String(selectedClassSection.id) : "";
  const filteredAssignments = uniqueAssignments.filter((assignment) =>
    `${assignment.branchName} ${assignment.yearName} ${assignment.className} ${assignment.sectionName} ${assignment.subjectName} ${assignment.subjectCode}`
      .toLocaleLowerCase().includes(normalizedSearch),
  );
  const assessmentClasses = [...new Map(assessments.map((assessment) => [
    assessment.classLevelId,
    { id: assessment.classLevelId, label: assessment.className },
  ])).values()].sort((a, b) => a.label.localeCompare(b.label));
  const filteredAssessments = assessments.filter((assessment) =>
    matchesTeacherExamAssessment(assessment, {
      status: assessmentStatusFilter,
      examTitleId: assessmentTitleFilter,
      sectionId: assessmentSectionFilter,
      classLevelId: assessmentClassFilter,
      search: normalizedSearch,
    }),
  ).sort((a, b) =>
    a.examName.localeCompare(b.examName) ||
    a.examDate.localeCompare(b.examDate) ||
    a.className.localeCompare(b.className) ||
    a.subjectName.localeCompare(b.subjectName),
  );
  const assessmentTitles = [...new Map(
    assessments
      .map((assessment) => [assessment.examId, assessment.examName]),
  )].sort((a, b) => a[1].localeCompare(b[1]));
  const filteredRoutines = routines.filter((routine) =>
    `${weekdays.get(routine.dayOfWeek) ?? "Other"} ${routine.startsAt} ${routine.endsAt} ${routine.className} ${routine.sectionName} ${routine.subjectName} ${routine.roomNumber ?? ""}`
      .toLocaleLowerCase().includes(normalizedSearch),
  );
  const grantedPermissions = new Set(context.grantedPermissions);
  const capabilities = [
    ...(grantedPermissions.has("results.enter") ? ["Enter and submit marks for assigned subjects"] : []),
    ...(classTeacherSections.length ? ["View appointed class registers and record daily attendance"] : []),
    ...(classTeacherSections.length ? ["View complete published report cards for appointed classes"] : []),
    ...(grantedPermissions.has("students.view") ? ["View student records (subject to assignment scope)"] : []),
    ...(grantedPermissions.has("students.update") ? ["Update student records and attendance (subject to school authorization)"] : []),
    ...(grantedPermissions.has("academics.manage") ? ["Manage academic setup"] : []),
    ...(grantedPermissions.has("examinations.create") ? ["Configure examinations"] : []),
    ...(grantedPermissions.has("results.publish") ? ["Review and publish results"] : []),
    ...(grantedPermissions.has("fees.balance.view") ? ["View student fee balances"] : []),
  ];
  const restrictions = [
    ...(!grantedPermissions.has("academics.delete") ? ["Cannot delete academic records"] : []),
    ...(!grantedPermissions.has("students.delete") ? ["Cannot delete student records"] : []),
    ...(!grantedPermissions.has("results.publish") ? ["Cannot approve or publish examination results"] : []),
    ...(!grantedPermissions.has("fees.manage") && !grantedPermissions.has("payments.record") ? ["No finance-management access"] : []),
  ];

  return (
    <TeacherPortalShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      teacherName={teacherName}
    >
      <main id="teacher-portal-print" className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-violet-700">
              {activeSection === "overview" ? "Teacher dashboard" : "Teacher workspace"}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {activeSection === "overview" ? `Welcome, ${teacherName}` : sectionTitles[activeSection]}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              {activeSection === "overview"
                ? "Your responsibilities, permissions, and teaching activity at a glance."
                : "Only information within your active teaching assignments and class appointments is shown."}
            </p>
          </div>
          <PrintButton targetId="teacher-portal-print" />
        </header>

        {!hasTeacherProfile ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <h2 className="font-semibold">Teacher profile not linked</h2>
            <p className="mt-1">
              Ask a school administrator to link your login account to an active staff and teacher record before using teaching assignments.
            </p>
          </section>
        ) : (
          <>
            {activeSection === "overview" && (
              <>
                <section aria-label="Teaching summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard icon={UsersRound} label="Subject assignments" value={uniqueAssignments.length} />
                  <SummaryCard icon={UsersRound} label="Appointed classes" value={classTeacherSections.length} />
                  <SummaryCard icon={CalendarDays} label="Scheduled lessons" value={routines.length} />
                  <SummaryCard icon={ClipboardCheck} label="Active exam assessments" value={assessments.length} />
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <article className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
                    <h2 className="font-semibold text-slate-950">Your responsibilities</h2>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {capabilities.map((capability) => (
                        <li key={capability} className="flex gap-2">
                          <span className="font-bold text-emerald-700" aria-hidden="true">✓</span>{capability}
                        </li>
                      ))}
                      {!classTeacherSections.length && (
                        <li className="text-slate-500">You are not currently appointed as a class teacher.</li>
                      )}
                    </ul>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="font-semibold text-slate-950">Permission boundaries</h2>
                    <p className="mt-1 text-sm text-slate-500">Actions are checked against your role and active assignments.</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {restrictions.map((restriction) => (
                        <li key={restriction} className="flex gap-2">
                          <span className="font-bold text-slate-400" aria-hidden="true">•</span>{restriction}
                        </li>
                      ))}
                      <li>Marks and student results are limited to assigned subjects or appointed classes.</li>
                    </ul>
                  </article>
                </section>

                <section aria-label="Portal sections" className="print:hidden grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <QuickLink href="/portal/teacher?section=classes" label="My classes" detail={`${uniqueAssignments.length} assigned subject sections`} icon={UsersRound} />
                  <QuickLink href="/portal/teacher?section=register" label="Class register" detail={`${classTeacherSections.length} appointed classes`} icon={UsersRound} />
                  <QuickLink href="/portal/teacher?section=assessments" label="Examination work" detail={`${assessments.length} available assessments`} icon={ClipboardCheck} />
                  <QuickLink href="/portal/teacher?section=timetable" label="My timetable" detail={`${routines.length} scheduled lessons`} icon={CalendarDays} />
                </section>
              </>
            )}

            {activeSection === "classes" && (
              <section id="classes" className="space-y-4">
                <SectionHeading title="My classes" description="Your current classes and subjects." />
                <SectionFilter section="classes" search={search} />
                {filteredAssignments.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredAssignments.map((assignment) => (
                    <article
                      key={`${assignment.yearName}-${assignment.className}-${assignment.sectionName}-${assignment.subjectName}`}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                        {assignment.branchName} · {assignment.yearName}
                      </p>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">
                        {assignment.className} · {assignment.sectionName}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">{assignment.subjectName}</p>
                      <p className="mt-2 text-xs text-slate-400">{assignment.subjectCode}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState>{search ? "No assignments match your search." : "There are no subject assignments in an active academic year yet."}</EmptyState>
              )}
              </section>
            )}

            {activeSection === "register" && <section id="register" className="space-y-4">
              <SectionHeading title="Class register and attendance" description="Record attendance for your assigned classes." />
              <TeacherClassAttendance
                key={`${selectedAttendanceSectionId}:${requestedDate}`}
                sections={attendanceSections}
                selectedSectionId={selectedAttendanceSectionId}
                attendanceDate={requestedDate}
                students={attendanceRoster}
              />
            </section>}

            {activeSection === "assessments" && <section id="assessments" className="space-y-4">
              <SectionHeading title="Examination work" description="Filter by title, status, section, or class." />
              <SectionFilter
                section="assessments"
                search={search}
                status={assessmentStatusFilter}
                showStatus
                examTitle={assessmentTitleFilter}
                examTitles={assessmentTitles}
                sectionId={assessmentSectionFilter === null ? "" : String(assessmentSectionFilter)}
                sections={assessmentSections}
                classLevelId={assessmentClassFilter === null ? "" : String(assessmentClassFilter)}
                classes={assessmentClasses}
              />
              {filteredAssessments.length ? (
                <>
                  <div className="grid gap-3 sm:hidden print:hidden">
                    {filteredAssessments.map((assessment) => (
                      <article key={assessment.assessmentId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="break-words font-bold text-slate-950">{assessment.examName}</h3>
                            <p className="mt-1 text-xs text-slate-500">{assessment.yearName} · {assessment.examDate}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                            {assessment.examStatus === "published" ? "Published" : assessment.assessmentStatus.replaceAll("_", " ")}
                          </span>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <InfoItem label="Class" value={assessment.className} />
                          <InfoItem label="Section" value={assessment.sectionNames.join(", ") || "Not assigned"} />
                          <InfoItem label="Subject" value={assessment.subjectName} />
                          <InfoItem label="Type" value={assessment.examTypeName ?? "Not set"} />
                        </dl>
                        <Link
                          href={`/admin/examinations/${assessment.examId}/subjects/${assessment.assessmentId}`}
                          className="mt-4 inline-flex min-h-10 items-center gap-1 font-semibold text-violet-700 hover:text-violet-900"
                        >
                          {assessment.examStatus === "published" ? "View results" : "Open marks"} <BookOpenCheck size={15} aria-hidden="true" />
                        </Link>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block print:block">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[46rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Examination</th>
                          <th className="px-4 py-3 font-semibold">Exam type</th>
                          <th className="px-4 py-3 font-semibold">Section</th>
                          <th className="px-4 py-3 font-semibold">Class</th>
                          <th className="px-4 py-3 font-semibold">Subject</th>
                          <th className="px-4 py-3 font-semibold">Assessment date</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredAssessments.map((assessment) => (
                          <tr key={assessment.assessmentId}>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {assessment.examName}<span className="mt-1 block text-xs font-normal text-slate-500">{assessment.yearName}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{assessment.examTypeName ?? "Not set"}</td>
                            <td className="px-4 py-3 text-slate-700">{assessment.sectionNames.join(", ") || "Not assigned"}</td>
                            <td className="px-4 py-3 text-slate-700">{assessment.className}</td>
                            <td className="px-4 py-3 text-slate-700">{assessment.subjectName}</td>
                            <td className="px-4 py-3 text-slate-700">{assessment.examDate}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {assessment.examStatus === "published" ? "Published" : assessment.assessmentStatus.replaceAll("_", " ")}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/admin/examinations/${assessment.examId}/subjects/${assessment.assessmentId}`}
                                className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:text-violet-900"
                              >
                                {assessment.examStatus === "published" ? "View results" : "Open marks"} <BookOpenCheck size={15} aria-hidden="true" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </div>
                </>
              ) : (
                <EmptyState>{search || assessmentStatusFilter || assessmentTitleFilter ? "No assessments match these filters." : "No open or published assessments are assigned to you for the active academic year."}</EmptyState>
              )}
              {classTeacherExamRows.length > 0 && (
                <section className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-4 sm:p-5">
                  <SectionHeading title="Class results to review" description="Review submissions for your class. Publishing requires Results publish permission." />
                  <div className="grid gap-3 lg:grid-cols-2">
                    {classTeacherExamRows.map((examClass) => {
                      const progress = classTeacherProgress.get(examClass.examClassId) ?? { total: 0, submitted: 0, approved: 0, published: 0 };
                      const published = progress.total > 0 && progress.published === progress.total;
                      const submittedSubjects = classTeacherSubjectStatuses.filter((subject) =>
                        subject.examClassId === examClass.examClassId && subject.status === "submitted",
                      );
                      return (
                        <article key={examClass.examClassId} className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{examClass.yearName} · {examClass.className}</p>
                          <h3 className="mt-1 font-bold text-slate-950">{examClass.examName}</h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {published ? "Published — marks are locked." : `${progress.submitted} subjects await review · ${progress.approved} of ${progress.total} approved.`}
                          </p>
                          {!published && submittedSubjects.length > 0 && (
                            <div className="mt-3 space-y-3">
                              {submittedSubjects.map((subject) => (
                                <div key={subject.examSubjectId} className="rounded-lg border border-slate-200 p-3">
                                  <p className="text-sm font-semibold text-slate-900">{subject.subjectName}</p>
                                  <ReviewSubjectForm examSubjectId={subject.examSubjectId} />
                                </div>
                              ))}
                            </div>
                          )}
                          <Link href={`/admin/examinations/${examClass.examId}`} className="mt-3 inline-block text-sm font-semibold text-violet-700">Review class assessment details →</Link>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </section>}

            {activeSection === "timetable" && <section id="timetable" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeading title="My weekly timetable" description="Lessons for your current subjects and sections." />
                {filteredRoutines.length > 0 && <PrintButton targetId="teacher-timetable-print" label="Print timetable" pageOrientation="landscape" />}
              </div>
              <SectionFilter section="timetable" search={search} />
              {filteredRoutines.length ? (
                <div id="teacher-timetable-print" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="grid gap-3 p-3 sm:hidden print:hidden">
                    {filteredRoutines.map((routine, index) => (
                      <article key={`${routine.dayOfWeek}-${routine.startsAt}-${routine.className}-${routine.sectionName}-${routine.subjectName}-${index}`} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-bold text-slate-950">{routine.subjectName}</h3>
                          <span className="shrink-0 text-xs font-semibold text-violet-700">{weekdays.get(routine.dayOfWeek) ?? "Other"}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-700">{routine.startsAt}–{routine.endsAt}</p>
                        <p className="mt-1 text-sm text-slate-600">{routine.className} · {routine.sectionName}</p>
                        <p className="mt-1 text-xs text-slate-500">Room {routine.roomNumber ?? "not assigned"}</p>
                      </article>
                    ))}
                  </div>
                  <div className="hidden sm:block print:block">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Day</th>
                          <th className="px-4 py-3 font-semibold">Time</th>
                          <th className="px-4 py-3 font-semibold">Class section</th>
                          <th className="px-4 py-3 font-semibold">Subject</th>
                          <th className="px-4 py-3 font-semibold">Room</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredRoutines.map((routine, index) => (
                          <tr key={`${routine.dayOfWeek}-${routine.startsAt}-${routine.className}-${routine.sectionName}-${routine.subjectName}-${index}`}>
                            <td className="px-4 py-3 font-medium text-slate-900">{weekdays.get(routine.dayOfWeek) ?? "Other"}</td>
                            <td className="px-4 py-3 text-slate-700">{routine.startsAt}–{routine.endsAt}</td>
                            <td className="px-4 py-3 text-slate-700">{routine.className} · {routine.sectionName}</td>
                            <td className="px-4 py-3 text-slate-700">{routine.subjectName}</td>
                            <td className="px-4 py-3 text-slate-700">{routine.roomNumber ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </div>
                </div>
              ) : (
                <EmptyState>{search ? "No timetable lessons match your search." : "No timetable periods have been scheduled for your active-year assignments."}</EmptyState>
              )}
            </section>}
          </>
        )}
      </main>
    </TeacherPortalShell>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
}) {
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="rounded-xl bg-violet-50 p-3 text-violet-700">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span>
        <span className="block text-2xl font-bold text-slate-950">{value}</span>
        <span className="block text-sm text-slate-500">{label}</span>
      </span>
    </article>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </header>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
      {children}
    </p>
  );
}

function SectionFilter({
  section,
  search,
  status = "",
  showStatus = false,
  examTitle = "",
  examTitles = [],
  sectionId = "",
  sections = [],
  classLevelId = "",
  classes = [],
}: {
  section: string;
  search: string;
  status?: string;
  showStatus?: boolean;
  examTitle?: string;
  examTitles?: [number, string][];
  sectionId?: string;
  sections?: { id: number; label: string }[];
  classLevelId?: string;
  classes?: { id: number; label: string }[];
}) {
  const showAssessmentFilters = showStatus && examTitles.length > 0;
  return (
    <SmartFilterForm method="get" action="/portal/teacher" className={`print:hidden grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:items-end ${showAssessmentFilters ? "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" : "sm:grid-cols-[minmax(0,1fr)_auto_auto]"}`}>
      <input type="hidden" name="section" value={section} />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Search
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Type to find a record..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
        />
      </label>
      {examTitles.length > 0 && (
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Exam title
          <select
            name="examTitle"
            defaultValue={examTitle}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900"
          >
            <option value="">All exam titles</option>
            {examTitles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      )}
      {showStatus && (
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Examination status
          <select
            name="status"
            defaultValue={status}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="published">Published</option>
          </select>
        </label>
      )}
      {showAssessmentFilters && (
        <>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Section
            <select
              name="sectionId"
              defaultValue={sectionId}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900"
            >
              <option value="">All sections</option>
              {sections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Class
            <select
              name="classLevelId"
              defaultValue={classLevelId}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900"
            >
              <option value="">All classes</option>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </>
      )}
      <div className="flex gap-2">
        <button type="submit" className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
          Search
        </button>
        {(search || status || examTitle || sectionId || classLevelId) && (
          <Link href={`/portal/teacher?section=${section}`} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Clear
          </Link>
        )}
      </div>
    </SmartFilterForm>
  );
}

function QuickLink({
  href,
  label,
  detail,
  icon: Icon,
}: {
  href: string;
  label: string;
  detail: string;
  icon: typeof UsersRound;
}) {
  return (
    <Link href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md">
      <span className="inline-flex rounded-xl bg-violet-50 p-3 text-violet-700">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h2 className="mt-3 font-semibold text-slate-950 group-hover:text-violet-800">{label}</h2>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </Link>
  );
}
