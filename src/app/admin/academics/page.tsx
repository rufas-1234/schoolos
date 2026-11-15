import { and, asc, countDistinct, desc, eq, inArray, ne } from "drizzle-orm";
import type { ReactNode } from "react";
import Link from "next/link";
import { db } from "@/db";
import { CalendarDays } from "lucide-react";
import {
  AdminActionDialog,
  AdminDataTable,
  AdminDeleteButton,
  AdminRecordDialog,
  type AdminTableColumn,
  type AdminTableFilter,
  type AdminTableRow,
} from "@/components/admin-data-table";
import {
  academicHolidays,
  academicTerms,
  academicYears,
  classRooms,
  classRoutines,
  classLevels,
  classSections,
  classSubjects,
  studentAcademicEvents,
  studentAttendance,
  studentEnrollments,
  students,
  subjects,
  schoolBranches,
  teachers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { academicSections, isAcademicSectionId } from "@/lib/academic-sections";
import { isCalendarDate } from "@/lib/academic-policy";
import { AcademicQuickSearch } from "./academic-quick-search";
import {
  AcademicTermForm,
  DeleteAcademicTermForm,
  AcademicYearForm,
  ClassSubjectForm,
  ClassLevelForm,
  ClassSectionForm,
  ClassSectionsForm,
  SubjectForm,
} from "./academic-forms";
import {
  deleteClassSection,
  deleteClassSubject,
  deleteSubject,
} from "./actions";
import {
  AcademicEventList,
  AcademicHolidayForm,
  AcademicYearStatusForm,
  ClassRoomForm,
  ClassRoomList,
  ClassRoutineList,
  EnrollmentOperationForm,
  EnrollmentRecordList,
  ClassLevelStatusForm,
  SchoolBranchForm,
  SchoolBranchList,
  SectionAssignmentForm,
  StudentPlacementForm,
  SubjectTeacherForm,
  ClassLevelDeleteForm,
} from "./management-forms";
import { AttendanceWorkspace } from "./attendance-workspace";
import { isAttendanceStatus } from "@/lib/attendance-policy";

export default async function AcademicStructurePage({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string | string[];
    search?: string | string[];
    attendanceSectionId?: string | string[];
    attendanceDate?: string | string[];
    notice?: string | string[];
  }>;
}) {
  const {
    section: requestedSection,
    search: requestedSearch,
    attendanceSectionId: requestedAttendanceSectionId,
    attendanceDate: requestedAttendanceDate,
    notice: requestedNotice,
  } = await searchParams;
  const sectionId =
    typeof requestedSection === "string" && isAcademicSectionId(requestedSection)
      ? requestedSection
      : undefined;
  const academicSearch = typeof requestedSearch === "string" ? requestedSearch.slice(0, 160) : "";
  const notice = requestedNotice === "class-deleted" ? "Class and its unused academic setup were permanently deleted." : null;
  const selectedSection = academicSections.find((section) => section.id === sectionId);
  const context = await requireSchoolPermission(["academics.manage", "school.settings.manage"]);
  const canDeleteAcademic =
    context.grantedPermissions.includes("academics.delete") ||
    context.grantedPermissions.includes("school.settings.manage");
  const canManageEnrollments = context.grantedPermissions.includes("students.update");
  const canViewEnrollmentHistory =
    canManageEnrollments || context.grantedPermissions.includes("students.view");
  const canViewAttendance =
    canManageEnrollments || context.grantedPermissions.includes("students.view");
  const attendanceDate =
    typeof requestedAttendanceDate === "string" && isCalendarDate(requestedAttendanceDate)
      ? requestedAttendanceDate
      : new Date().toISOString().slice(0, 10);
  const requestedAttendanceSection =
    typeof requestedAttendanceSectionId === "string" && /^\d+$/.test(requestedAttendanceSectionId)
      ? Number(requestedAttendanceSectionId)
      : null;
  const [
    branches,
    years,
    terms,
    classes,
    classStudentCounts,
    sectionStudentCounts,
    sections,
    schoolSubjects,
    subjectAssignments,
    schoolTeachers,
    rooms,
    routines,
    holidays,
    eligibleStudents,
    enrollments,
    academicEvents,
  ] = await Promise.all([
    db
      .select({
        id: schoolBranches.id,
        publicId: schoolBranches.publicId,
        name: schoolBranches.name,
        code: schoolBranches.code,
        status: schoolBranches.status,
        contactNumber: schoolBranches.contactNumber,
        email: schoolBranches.email,
        address: schoolBranches.address,
      })
      .from(schoolBranches)
      .where(eq(schoolBranches.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name)),
    db
      .select()
      .from(academicYears)
      .where(eq(academicYears.schoolId, context.schoolId))
      .orderBy(asc(academicYears.startDate)),
    db
      .select({
        id: academicTerms.id,
        academicYearId: academicTerms.academicYearId,
        name: academicTerms.name,
        yearName: academicYears.name,
        startDate: academicTerms.startDate,
        endDate: academicTerms.endDate,
        examStartDate: academicTerms.examStartDate,
        examEndDate: academicTerms.examEndDate,
      })
      .from(academicTerms)
      .innerJoin(academicYears, eq(academicTerms.academicYearId, academicYears.id))
      .where(eq(academicTerms.schoolId, context.schoolId))
      .orderBy(asc(academicTerms.startDate)),
    db
      .select({
        id: classLevels.id,
        name: classLevels.name,
        code: classLevels.code,
        status: classLevels.status,
        branchId: classLevels.branchId,
        branchName: schoolBranches.name,
      })
      .from(classLevels)
      .innerJoin(schoolBranches, eq(classLevels.branchId, schoolBranches.id))
      .where(eq(classLevels.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name), asc(classLevels.name)),
    db
      .select({
        classLevelId: classSections.classLevelId,
        studentCount: countDistinct(students.id),
      })
      .from(studentEnrollments)
      .innerJoin(students, and(
        eq(studentEnrollments.studentId, students.id),
        eq(students.schoolId, context.schoolId),
      ))
      .innerJoin(classSections, and(
        eq(studentEnrollments.classSectionId, classSections.id),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(academicYears, and(
        eq(studentEnrollments.academicYearId, academicYears.id),
        eq(academicYears.id, classSections.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.status, "enrolled"),
        eq(academicYears.status, "active"),
        ne(students.status, "disabled"),
      ))
      .groupBy(classSections.classLevelId),
    db
      .select({
        classSectionId: classSections.id,
        studentCount: countDistinct(students.id),
      })
      .from(studentEnrollments)
      .innerJoin(students, and(
        eq(studentEnrollments.studentId, students.id),
        eq(students.schoolId, context.schoolId),
      ))
      .innerJoin(classSections, and(
        eq(studentEnrollments.classSectionId, classSections.id),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(academicYears, and(
        eq(studentEnrollments.academicYearId, academicYears.id),
        eq(academicYears.id, classSections.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentEnrollments.schoolId, context.schoolId),
        eq(studentEnrollments.status, "enrolled"),
        ne(students.status, "disabled"),
      ))
      .groupBy(classSections.id),
    db
      .select({
        id: classSections.id,
        name: classSections.name,
        yearName: academicYears.name,
        yearStatus: academicYears.status,
        academicYearId: classSections.academicYearId,
        classLevelId: classSections.classLevelId,
        classStatus: classLevels.status,
        className: classLevels.name,
        branchId: classLevels.branchId,
        branchName: schoolBranches.name,
        capacity: classSections.capacity,
        classTeacherId: classSections.classTeacherId,
        teacherFirstName: teachers.firstName,
        teacherLastName: teachers.lastName,
      })
      .from(classSections)
      .innerJoin(academicYears, eq(classSections.academicYearId, academicYears.id))
      .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
      .innerJoin(schoolBranches, eq(classLevels.branchId, schoolBranches.id))
      .leftJoin(teachers, eq(classSections.classTeacherId, teachers.id))
      .where(eq(classSections.schoolId, context.schoolId))
      .orderBy(asc(academicYears.startDate), asc(schoolBranches.name), asc(classLevels.name), asc(classSections.name)),
    db
      .select({
        id: subjects.id,
        name: subjects.name,
        code: subjects.code,
        subjectType: subjects.subjectType,
        branchId: subjects.branchId,
        branchName: schoolBranches.name,
      })
      .from(subjects)
      .innerJoin(schoolBranches, eq(subjects.branchId, schoolBranches.id))
      .where(eq(subjects.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name), asc(subjects.name)),
    db
      .select({
        id: classSubjects.id,
        classLevelId: classSubjects.classLevelId,
        subjectId: classSubjects.subjectId,
        className: classLevels.name,
        branchId: classLevels.branchId,
        branchName: schoolBranches.name,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        subjectType: subjects.subjectType,
        isCompulsory: classSubjects.isCompulsory,
        teacherId: classSubjects.teacherId,
        teacherFirstName: teachers.firstName,
        teacherLastName: teachers.lastName,
      })
      .from(classSubjects)
      .innerJoin(classLevels, eq(classSubjects.classLevelId, classLevels.id))
      .innerJoin(schoolBranches, eq(classLevels.branchId, schoolBranches.id))
      .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
      .leftJoin(teachers, eq(classSubjects.teacherId, teachers.id))
      .where(eq(classSubjects.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name), asc(classLevels.name), asc(subjects.name)),
    db
      .select({
        id: teachers.id,
        firstName: teachers.firstName,
        lastName: teachers.lastName,
        employeeCode: teachers.employeeCode,
        email: teachers.email,
        phone: teachers.phone,
        status: teachers.status,
        branchId: teachers.branchId,
        branchName: schoolBranches.name,
      })
      .from(teachers)
      .innerJoin(schoolBranches, eq(teachers.branchId, schoolBranches.id))
      .where(eq(teachers.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name), asc(teachers.lastName), asc(teachers.firstName)),
    db
      .select({
        id: classRooms.id,
        publicId: classRooms.publicId,
        branchId: classRooms.branchId,
        branchName: schoolBranches.name,
        roomNumber: classRooms.roomNumber,
        capacity: classRooms.capacity,
        location: classRooms.location,
      })
      .from(classRooms)
      .innerJoin(schoolBranches, eq(classRooms.branchId, schoolBranches.id))
      .where(eq(classRooms.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name), asc(classRooms.roomNumber)),
    db
      .select({
        id: classRoutines.id,
        publicId: classRoutines.publicId,
        dayOfWeek: classRoutines.dayOfWeek,
        classSubjectId: classRoutines.classSubjectId,
        classRoomId: classRoutines.classRoomId,
        startsAt: classRoutines.startsAt,
        endsAt: classRoutines.endsAt,
        branchId: classLevels.branchId,
        classLevelId: classLevels.id,
        classStatus: classLevels.status,
        classSectionId: classSections.id,
        branchName: schoolBranches.name,
        yearName: academicYears.name,
        sectionName: classSections.name,
        className: classLevels.name,
        subjectName: subjects.name,
        teacherFirstName: teachers.firstName,
        teacherLastName: teachers.lastName,
        roomNumber: classRooms.roomNumber,
      })
      .from(classRoutines)
      .innerJoin(classSections, eq(classRoutines.classSectionId, classSections.id))
      .innerJoin(academicYears, eq(classSections.academicYearId, academicYears.id))
      .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
      .innerJoin(schoolBranches, eq(classLevels.branchId, schoolBranches.id))
      .innerJoin(classSubjects, eq(classRoutines.classSubjectId, classSubjects.id))
      .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
      .leftJoin(teachers, eq(classSubjects.teacherId, teachers.id))
      .leftJoin(classRooms, eq(classRoutines.classRoomId, classRooms.id))
      .where(and(eq(classRoutines.schoolId, context.schoolId), eq(classLevels.schoolId, context.schoolId)))
      .orderBy(asc(classRoutines.dayOfWeek), asc(classRoutines.startsAt)),
    db
      .select({
        id: academicHolidays.id,
        academicYearId: academicHolidays.academicYearId,
        academicTermId: academicHolidays.academicTermId,
        name: academicHolidays.name,
        startDate: academicHolidays.startDate,
        endDate: academicHolidays.endDate,
        yearName: academicYears.name,
        termName: academicTerms.name,
      })
      .from(academicHolidays)
      .innerJoin(academicYears, eq(academicHolidays.academicYearId, academicYears.id))
      .leftJoin(academicTerms, eq(academicHolidays.academicTermId, academicTerms.id))
      .where(eq(academicHolidays.schoolId, context.schoolId))
      .orderBy(asc(academicHolidays.startDate)),
    canManageEnrollments
      ? db
          .select({
            id: students.id,
            firstName: students.firstName,
            lastName: students.lastName,
            publicId: students.publicId,
          })
          .from(students)
          .where(
            and(
              eq(students.schoolId, context.schoolId),
              inArray(students.status, ["admitted", "active"]),
            ),
          )
          .orderBy(asc(students.lastName), asc(students.firstName))
      : Promise.resolve([]),
    canViewEnrollmentHistory
      ? db
          .select({
            id: studentEnrollments.id,
            studentId: studentEnrollments.studentId,
            studentFirstName: students.firstName,
            studentLastName: students.lastName,
            yearName: academicYears.name,
            yearStatus: academicYears.status,
            className: classLevels.name,
            sectionName: classSections.name,
            status: studentEnrollments.status,
            enrolledAt: studentEnrollments.enrolledAt,
          })
          .from(studentEnrollments)
          .innerJoin(students, eq(studentEnrollments.studentId, students.id))
          .innerJoin(academicYears, eq(studentEnrollments.academicYearId, academicYears.id))
          .innerJoin(classSections, eq(studentEnrollments.classSectionId, classSections.id))
          .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
          .where(eq(studentEnrollments.schoolId, context.schoolId))
          .orderBy(desc(studentEnrollments.enrolledAt))
          .limit(100)
      : Promise.resolve([]),
    canViewEnrollmentHistory
      ? db
          .select({
            id: studentAcademicEvents.id,
            fromClassSectionId: studentAcademicEvents.fromClassSectionId,
            toClassSectionId: studentAcademicEvents.toClassSectionId,
            studentFirstName: students.firstName,
            studentLastName: students.lastName,
            eventType: studentAcademicEvents.eventType,
            eventDate: studentAcademicEvents.eventDate,
            reason: studentAcademicEvents.reason,
            externalInstitution: studentAcademicEvents.externalInstitution,
          })
          .from(studentAcademicEvents)
          .innerJoin(students, eq(studentAcademicEvents.studentId, students.id))
          .where(eq(studentAcademicEvents.schoolId, context.schoolId))
          .orderBy(desc(studentAcademicEvents.eventDate), desc(studentAcademicEvents.id))
          .limit(30)
      : Promise.resolve([]),
  ]);

  const activeAttendanceSection = sections.find(
    (section) =>
      section.id === requestedAttendanceSection &&
      section.yearStatus === "active",
  );
  const studentCountByClass = new Map(
    classStudentCounts.map((entry) => [entry.classLevelId, entry.studentCount]),
  );
  const studentCountBySection = new Map(
    sectionStudentCounts.map((entry) => [entry.classSectionId, entry.studentCount]),
  );
  const activeAcademicYear = years.find((year) => year.status === "active");
  const attendanceRoster =
    sectionId === "attendance" && activeAttendanceSection && canViewAttendance
      ? await db
          .select({
            studentId: students.id,
            firstName: students.firstName,
            lastName: students.lastName,
            publicId: students.publicId,
            status: studentAttendance.status,
            note: studentAttendance.note,
          })
          .from(studentEnrollments)
          .innerJoin(students, eq(studentEnrollments.studentId, students.id))
          .leftJoin(
            studentAttendance,
            and(
              eq(studentAttendance.schoolId, context.schoolId),
              eq(studentAttendance.studentId, students.id),
              eq(studentAttendance.classSectionId, activeAttendanceSection.id),
              eq(studentAttendance.attendanceDate, attendanceDate),
            ),
          )
          .where(
            and(
              eq(studentEnrollments.schoolId, context.schoolId),
              eq(studentEnrollments.classSectionId, activeAttendanceSection.id),
              eq(studentEnrollments.academicYearId, activeAttendanceSection.academicYearId),
              eq(studentEnrollments.status, "enrolled"),
              ne(students.status, "disabled"),
            ),
          )
          .orderBy(asc(students.lastName), asc(students.firstName))
      : [];

  const branchOptions = branches
    .filter((branch) => branch.status === "active")
    .map((branch) => ({ id: branch.id, label: branch.name }));
  const allBranchOptions = branches.map((branch) => ({
    id: branch.id,
    label: `${branch.name}${branch.status === "inactive" ? " · inactive" : ""}`,
  }));
  const yearOptions = years
    .filter((year) => year.status !== "archived")
    .map((year) => ({ id: year.id, label: `${year.name} · ${year.status}` }));
  const allYearOptions = years.map((year) => ({ id: year.id, label: `${year.name} · ${year.status}` }));
  const classOptions = classes.filter((classLevel) => classLevel.status === "active").map((classLevel) => ({
    id: classLevel.id,
    branchId: classLevel.branchId,
    label: classLevel.name,
  }));
  const subjectOptions = schoolSubjects.map((subject) => ({
    id: subject.id,
    branchId: subject.branchId,
    label: subject.name,
  }));
  const teacherOptions = schoolTeachers
    .filter((teacher) => teacher.status === "active")
    .map((teacher) => ({
      id: teacher.id,
      branchId: teacher.branchId,
      label: `${teacher.firstName} ${teacher.lastName}`,
    }));
  const sectionOptions = sections.filter((section) => section.classStatus === "active").map((section) => ({
    id: section.id,
    branchId: section.branchId,
    classLevelId: section.classLevelId,
    label: `${section.className} ${section.name} · ${section.yearName}`,
  }));
  const assignmentOptions = subjectAssignments.map((assignment) => ({
    id: assignment.id,
    branchId: assignment.branchId,
    label: `${assignment.className} · ${assignment.subjectName}`,
  }));
  const routineAssignmentOptions = subjectAssignments.map((assignment) => ({
    id: assignment.id,
    classLevelId: assignment.classLevelId,
    label: assignment.subjectName,
  }));
  const roomOptions = rooms.map((room) => ({
    id: room.id,
    branchId: room.branchId,
    label: room.roomNumber,
  }));
  const classFilterOptions = classes.filter((classLevel) => classLevel.status === "active").map((classLevel) => ({
    id: classLevel.id,
    branchId: classLevel.branchId,
    label: classLevel.name,
  }));
  const branchFilters: AdminTableFilter[] = [{
    key: "branchId",
    label: "branch",
    options: branches.map((branch) => ({
      value: String(branch.id),
      label: branch.name,
    })),
  }];
  const yearFilters: AdminTableFilter[] = [{
    key: "academicYearId",
    label: "academic year",
    options: allYearOptions.map((year) => ({
      value: String(year.id),
      label: year.label,
    })),
  }];
  const yearStatusFilters: AdminTableFilter[] = [{
    key: "status",
    label: "status",
    options: [
      { value: "upcoming", label: "Upcoming" },
      { value: "active", label: "Active" },
      { value: "completed", label: "Completed" },
      { value: "archived", label: "Archived" },
    ],
  }];
  const classFilters: AdminTableFilter[] = [{
    key: "classLevelId",
    label: "class",
    options: classFilterOptions.map((classLevel) => ({
      value: String(classLevel.id),
      label: classLevel.label,
    })),
  }];
  const classSubjectFilters: AdminTableFilter[] = [
    ...branchFilters,
    ...classFilters,
  ];
  const sectionFilterOptions = sections.filter((section) => section.classStatus === "active").map((section) => ({
    id: section.id,
    branchId: section.branchId,
    classLevelId: section.classLevelId,
    label: `${section.className} ${section.name} · ${section.yearName}`,
  }));
  const activeSectionOptions = sections
    .filter((section) => section.yearStatus === "active" && section.classStatus === "active")
    .map((section) => ({
      id: section.id,
      branchId: section.branchId,
      label: `${section.className} ${section.name}`,
    }));
  const eligibleStudentOptions = eligibleStudents.map((student) => ({
    id: student.id,
    label: `${student.firstName} ${student.lastName}`,
  }));
  const currentEnrollments = enrollments.filter(
    (enrollment) => enrollment.status === "enrolled" && enrollment.yearStatus === "active",
  );
  const enrollmentOptions = currentEnrollments.map((enrollment) => ({
    id: enrollment.id,
    label: `${enrollment.studentFirstName} ${enrollment.studentLastName} · ${enrollment.className} ${enrollment.sectionName} · ${enrollment.yearName}`,
  }));
  const sectionNameById = new Map(
    sections.map((section) => [
      section.id,
      `${section.branchName} · ${section.className} ${section.name} · ${section.yearName}`,
    ]),
  );
  const academicSearchOptions = [
    ...branches.map((branch) => ({
      id: `branch-${branch.id}`,
      type: "Branch" as const,
      label: branch.name,
      searchText: `${branch.name} ${branch.code}`,
      section: "branches" as const,
    })),
    ...classes.map((classLevel) => ({
      id: `class-${classLevel.id}`,
      type: "Class" as const,
      label: classLevel.name,
      searchText: `${classLevel.branchName} ${classLevel.name} ${classLevel.code}`,
      section: "classes" as const,
    })),
    ...sections.map((section) => ({
      id: `section-${section.id}`,
      type: "Class section" as const,
      label: `${section.className} ${section.name} · ${section.yearName}`,
      searchText: `${section.branchName} ${section.className} ${section.name} ${section.yearName}`,
      section: "sections" as const,
    })),
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-violet-700">Phase 2</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {selectedSection?.label ?? "Academic structure"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          {selectedSection
            ? `${selectedSection.description} Records are scoped to ${context.schoolName}.`
            : `Choose an academic section from the navigation to manage records for ${context.schoolName}.`}
        </p>
      </div>
      <AcademicQuickSearch options={academicSearchOptions} />
      {notice && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </p>
      )}

      {!selectedSection ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <CalendarDays className="mx-auto text-violet-600" size={28} />
          <h2 className="mt-3 text-base font-semibold text-slate-900">Select an academic section</h2>
          <p className="mt-1 text-sm text-slate-500">
            Open Academics in the navigation, then choose the records you want to manage.
          </p>
        </section>
      ) : (
        <>
          <section aria-label="Academic records" className="space-y-4">
            {sectionId === "branches" && (
              <SchoolBranchList
                key={`branches-${academicSearch}`}
                branches={branches}
                initialQuery={academicSearch}
                filters={[{
                  key: "status",
                  label: "status",
                  options: [
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ],
                }]}
                toolbarActions={
                  <AdminActionDialog label="Add branch" title="Add branch">
                    <SchoolBranchForm />
                  </AdminActionDialog>
                }
              />
            )}
            {sectionId === "years" && (
              <RecordList
                title="Academic years"
                columns={[
                  { key: "name", label: "Academic year" },
                  { key: "startDate", label: "Start date" },
                  { key: "endDate", label: "End date" },
                  { key: "status", label: "Status" },
                ]}
                empty="No academic years yet."
                filters={yearStatusFilters}
                toolbarActions={
                  <>
                    <AdminActionDialog label="Add year" title="Add academic year">
                      <AcademicYearForm />
                    </AdminActionDialog>
                    <AdminActionDialog label="Change year status" title="Activate or archive an academic year">
                      <AcademicYearStatusForm
                        years={years.map((year) => ({ id: year.id, label: `${year.name} · ${year.status}` }))}
                      />
                    </AdminActionDialog>
                  </>
                }
                records={years.map((year) => ({
                  id: year.id,
                  values: {
                    name: year.name,
                    startDate: year.startDate,
                    endDate: year.endDate,
                    status: year.status,
                  },
                  editForm: <AcademicYearForm record={year} />,
                }))}
              />
            )}
            {sectionId === "terms" && (
              <RecordList
                title="Terms"
                columns={[
                  { key: "name", label: "Term" },
                  { key: "year", label: "Academic year" },
                  { key: "startDate", label: "Start date" },
                  { key: "endDate", label: "End date" },
                  { key: "examPeriod", label: "Exam period" },
                ]}
                empty="No terms yet."
                filters={yearFilters}
                toolbarActions={
                  <AdminActionDialog label="Add term" title="Add academic term">
                    <AcademicTermForm years={yearOptions} />
                  </AdminActionDialog>
                }
                records={terms.map((term) => ({
                  id: term.id,
                  values: {
                    name: term.name,
                    year: term.yearName,
                    academicYearId: String(term.academicYearId),
                    startDate: term.startDate,
                    endDate: term.endDate,
                    examPeriod: term.examStartDate && term.examEndDate
                      ? `${term.examStartDate} – ${term.examEndDate}`
                      : "Not set",
                  },
                  editForm: <AcademicTermForm years={allYearOptions} record={term} />,
                  deleteForm: canDeleteAcademic ? (
                    <DeleteAcademicTermForm termId={term.id} termName={term.name} />
                  ) : undefined,
                }))}
              />
            )}
            {sectionId === "classes" && (
              <RecordList
                key={`classes-${academicSearch}`}
                title="Classes"
                columns={[
                  { key: "branch", label: "Branch" },
                  { key: "name", label: "Class" },
                  { key: "code", label: "Code" },
                  { key: "status", label: "Status" },
                  { key: "studentCount", label: "Students enrolled" },
                ]}
                empty="No classes yet."
                toolbarActions={
                  <AdminActionDialog label="Add class" title="Add class">
                    <ClassLevelForm branches={branchOptions} years={yearOptions} />
                  </AdminActionDialog>
                }
                records={classes.map((classLevel) => ({
                  id: classLevel.id,
                  searchableText: `${classLevel.branchName} ${classLevel.name} ${classLevel.code}`,
                  values: {
                    branch: classLevel.branchName,
                    name: classLevel.name,
                    code: classLevel.code,
                    status: classLevel.status,
                    studentCount: String(studentCountByClass.get(classLevel.id) ?? 0),
                    branchId: String(classLevel.branchId),
                  },
                  actions: (
                    <>
                      {activeAcademicYear && (
                        <Link
                          href={`/admin/academics/rosters/print?classLevelId=${classLevel.id}&academicYearId=${activeAcademicYear.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Print roster
                        </Link>
                      )}
                      <AdminRecordDialog title={classLevel.status === "active" ? "Archive class" : "Restore class"}>
                        <ClassLevelStatusForm classLevelId={classLevel.id} status={classLevel.status} />
                      </AdminRecordDialog>
                    </>
                  ),
                  editForm: (
                    <ClassLevelForm
                      branches={allBranchOptions}
                      years={allYearOptions}
                      record={classLevel}
                    />
                  ),
                  deleteForm: canDeleteAcademic ? (
                    <ClassLevelDeleteForm classLevelId={classLevel.id} />
                  ) : undefined,
                }))}
                filters={branchFilters}
                initialQuery={academicSearch}
              />
            )}
            {sectionId === "sections" && (
              <RecordList
                key={`sections-${academicSearch}`}
                title="Class sections"
                columns={[
                  { key: "branch", label: "Branch" },
                  { key: "class", label: "Class" },
                  { key: "section", label: "Section name" },
                  { key: "year", label: "Academic year" },
                  { key: "students", label: "Students enrolled" },
                  { key: "capacity", label: "Capacity" },
                  { key: "teacher", label: "Class teacher" },
                ]}
                empty="No streams or sections yet."
                toolbarActions={
                  <>
                    <AdminActionDialog label="Add sections" title="Add class sections">
                      <ClassSectionsForm branches={branchOptions} years={yearOptions} classes={classOptions} />
                    </AdminActionDialog>
                    <AdminActionDialog label="Assign section capacity or teacher" title="Update section assignments">
                      <SectionAssignmentForm branches={branchOptions} sections={sectionOptions} teachers={teacherOptions} />
                    </AdminActionDialog>
                  </>
                }
                records={sections.map((section) => ({
                  id: section.id,
                  searchableText: `${section.branchName} ${section.className} ${section.name} ${section.yearName}`,
                  values: {
                    branch: section.branchName,
                    class: section.className,
                    section: section.name,
                    year: section.yearName,
                    students: String(studentCountBySection.get(section.id) ?? 0),
                    capacity: section.capacity === null ? "Unlimited" : String(section.capacity),
                    teacher: section.teacherFirstName
                      ? `${section.teacherFirstName} ${section.teacherLastName}`
                      : "Not assigned",
                    branchId: String(section.branchId),
                    classLevelId: String(section.classLevelId),
                    academicYearId: String(section.academicYearId),
                  },
                  actions: (
                    <Link
                      href={`/admin/academics/rosters/print?sectionId=${section.id}&academicYearId=${section.academicYearId}`}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Print roster
                    </Link>
                  ),
                  editForm: (
                    <div className="space-y-3">
                      <ClassSectionForm
                        branches={allBranchOptions}
                        years={allYearOptions}
                        classes={classOptions}
                        record={section}
                      />
                      <SectionAssignmentForm
                        branches={allBranchOptions}
                        sections={sectionOptions}
                        teachers={teacherOptions}
                        record={{
                          sectionId: section.id,
                          capacity: section.capacity,
                          teacherId: section.classTeacherId,
                        }}
                      />
                    </div>
                  ),
                  deleteForm: canDeleteAcademic ? (
                    <form action={deleteClassSection}>
                      <input type="hidden" name="recordId" value={section.id} />
                      <AdminDeleteButton label="Delete class section" />
                    </form>
                  ) : undefined,
                }))}
                filters={[
                  ...branchFilters,
                  ...classFilters,
                  {
                    key: "academicYearId",
                    label: "academic year",
                    options: allYearOptions.map((year) => ({
                      value: String(year.id),
                      label: year.label,
                    })),
                  },
                ]}
                initialQuery={academicSearch}
              />
            )}
            {sectionId === "subjects" && (
              <>
                <RecordList
                  title="Subjects"
                  columns={[
                    { key: "branch", label: "Branch" },
                    { key: "name", label: "Subject" },
                    { key: "code", label: "Code" },
                    { key: "type", label: "Type" },
                  ]}
                  empty="No subjects yet."
                  toolbarActions={
                    <>
                      <Link
                        href="/admin/academics/subjects/print"
                        className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Print subjects
                      </Link>
                      <AdminActionDialog label="Add subject" title="Add subject">
                        <SubjectForm branches={branchOptions} />
                      </AdminActionDialog>
                    </>
                  }
                  records={schoolSubjects.map((subject) => ({
                    id: subject.id,
                    values: {
                      branch: subject.branchName,
                      name: subject.name,
                      code: subject.code,
                      type: subject.subjectType,
                      branchId: String(subject.branchId),
                    },
                    editForm: <SubjectForm branches={allBranchOptions} record={subject} />,
                    deleteForm: canDeleteAcademic ? (
                      <form action={deleteSubject}>
                        <input type="hidden" name="recordId" value={subject.id} />
                        <AdminDeleteButton label="Delete subject" />
                      </form>
                    ) : undefined,
                  }))}
                  filters={branchFilters}
                />
                <RecordList
                  title="Class subjects"
                  columns={[
                    { key: "branch", label: "Branch" },
                    { key: "class", label: "Class" },
                    { key: "subject", label: "Subject" },
                    { key: "requirement", label: "Requirement" },
                    { key: "teacher", label: "Teacher" },
                  ]}
                  empty="No subjects assigned to classes yet."
                  toolbarActions={
                    <>
                      <AdminActionDialog label="Assign subject to class" title="Assign subject to class">
                        <ClassSubjectForm branches={branchOptions} classes={classOptions} subjects={subjectOptions} />
                      </AdminActionDialog>
                      <AdminActionDialog label="Assign subject teacher" title="Assign subject teacher">
                        <SubjectTeacherForm
                          branches={branchOptions}
                          assignments={assignmentOptions}
                          teachers={teacherOptions}
                        />
                      </AdminActionDialog>
                    </>
                  }
                  records={subjectAssignments.map((assignment) => ({
                    id: assignment.id,
                    values: {
                      branch: assignment.branchName,
                      class: assignment.className,
                      subject: `${assignment.subjectName} (${assignment.subjectCode})`,
                      requirement: assignment.isCompulsory ? "Compulsory" : "Optional",
                      teacher: assignment.teacherFirstName
                        ? `${assignment.teacherFirstName} ${assignment.teacherLastName}`
                        : "Not assigned",
                      branchId: String(assignment.branchId),
                      classLevelId: String(assignment.classLevelId),
                    },
                    editForm: (
                      <div className="space-y-3">
                        <ClassSubjectForm
                          branches={allBranchOptions}
                          classes={classOptions}
                          subjects={subjectOptions}
                          record={assignment}
                        />
                        <SubjectTeacherForm
                          branches={allBranchOptions}
                          assignments={assignmentOptions}
                          teachers={teacherOptions}
                          record={{ assignmentId: assignment.id, teacherId: assignment.teacherId }}
                        />
                      </div>
                    ),
                    deleteForm: canDeleteAcademic ? (
                      <form action={deleteClassSubject}>
                        <input type="hidden" name="recordId" value={assignment.id} />
                        <AdminDeleteButton label="Remove class subject assignment" />
                      </form>
                    ) : undefined,
                  }))}
                  filters={classSubjectFilters}
                />
              </>
            )}
            {sectionId === "optional-subjects" && (
              <RecordList
                title="Optional subjects"
                columns={[
                  { key: "branch", label: "Branch" },
                  { key: "class", label: "Class" },
                  { key: "subject", label: "Subject" },
                  { key: "teacher", label: "Teacher" },
                ]}
                empty="No optional subjects have been assigned yet."
                toolbarActions={
                  <AdminActionDialog label="Assign optional subject" title="Assign optional subject">
                    <ClassSubjectForm
                      branches={branchOptions}
                      classes={classOptions}
                      subjects={subjectOptions}
                      defaultCompulsory={false}
                    />
                  </AdminActionDialog>
                }
                records={subjectAssignments
                  .filter((assignment) => !assignment.isCompulsory)
                  .map((assignment) => ({
                    id: assignment.id,
                    values: {
                      branch: assignment.branchName,
                      class: assignment.className,
                      subject: `${assignment.subjectName} (${assignment.subjectCode})`,
                      teacher: assignment.teacherFirstName
                        ? `${assignment.teacherFirstName} ${assignment.teacherLastName}`
                        : "Not assigned",
                      branchId: String(assignment.branchId),
                      classLevelId: String(assignment.classLevelId),
                    },
                    editForm: (
                      <div className="space-y-3">
                        <ClassSubjectForm
                          branches={allBranchOptions}
                          classes={classOptions}
                          subjects={subjectOptions}
                          record={assignment}
                        />
                        <SubjectTeacherForm
                          branches={allBranchOptions}
                          assignments={assignmentOptions}
                          teachers={teacherOptions}
                          record={{ assignmentId: assignment.id, teacherId: assignment.teacherId }}
                        />
                      </div>
                    ),
                    deleteForm: canDeleteAcademic ? (
                      <form action={deleteClassSubject}>
                        <input type="hidden" name="recordId" value={assignment.id} />
                        <AdminDeleteButton label="Remove optional subject assignment" />
                      </form>
                    ) : undefined,
                  }))}
                filters={classSubjectFilters}
              />
            )}
            {sectionId === "teachers" && (
              <RecordList
                title="Teachers"
                columns={[
                  { key: "branch", label: "Branch" },
                  { key: "name", label: "Teacher" },
                  { key: "employeeCode", label: "Employee code" },
                  { key: "email", label: "Email" },
                  { key: "status", label: "Status" },
                ]}
                empty="No teachers are linked yet. Add a staff member in Human Resources and set their staff role to Teacher."
                toolbarActions={
                  <Link
                    href="/admin/staff"
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Manage staff in Human Resources
                  </Link>
                }
                records={schoolTeachers.map((teacher) => ({
                  id: teacher.id,
                  values: {
                    branch: teacher.branchName,
                    name: `${teacher.firstName} ${teacher.lastName}`,
                    employeeCode: teacher.employeeCode ?? "",
                    email: teacher.email ?? "",
                    status: teacher.status,
                    branchId: String(teacher.branchId),
                  },
                }))}
                filters={branchFilters}
              />
            )}
            {sectionId === "classrooms" && (
              <ClassRoomList
                branches={allBranchOptions}
                filters={branchFilters}
                canDelete={canDeleteAcademic}
                toolbarActions={
                  <AdminActionDialog label="Add classroom" title="Add classroom">
                    <ClassRoomForm branches={branchOptions} />
                  </AdminActionDialog>
                }
                rooms={rooms.map((room) => ({
                  id: room.id,
                  publicId: room.publicId,
                  branchId: room.branchId,
                  branchName: room.branchName,
                  roomNumber: room.roomNumber,
                  capacity: room.capacity,
                  location: room.location,
                }))}
              />
            )}
            {sectionId === "routines" && (
              <ClassRoutineList
                branches={branchOptions}
                classes={classFilterOptions}
                sections={sectionFilterOptions}
                assignments={routineAssignmentOptions}
                rooms={roomOptions}
                canDelete={canDeleteAcademic}
                routines={routines.map((routine) => ({
                  id: routine.id,
                  publicId: routine.publicId,
                  branchId: routine.branchId,
                  classLevelId: routine.classLevelId,
                  classSectionId: routine.classSectionId,
                  classSubjectId: routine.classSubjectId,
                  classRoomId: routine.classRoomId,
                  dayOfWeek: routine.dayOfWeek,
                  startsAt: routine.startsAt,
                  endsAt: routine.endsAt,
                  branchName: routine.branchName,
                  yearName: routine.yearName,
                  sectionName: routine.sectionName,
                  className: routine.className,
                  subjectName: routine.subjectName,
                  teacherName: routine.teacherFirstName
                    ? `${routine.teacherFirstName} ${routine.teacherLastName}`
                    : "Not assigned",
                  roomNumber: routine.roomNumber ?? "",
                }))}
              />
            )}
            {sectionId === "holidays" && (
              <RecordList
                title="School holidays"
                columns={[
                  { key: "name", label: "Holiday" },
                  { key: "year", label: "Academic year" },
                  { key: "term", label: "Term" },
                  { key: "startDate", label: "Start date" },
                  { key: "endDate", label: "End date" },
                ]}
                empty="No holidays have been recorded."
                filters={yearFilters}
                toolbarActions={
                  <AdminActionDialog label="Add holiday" title="Add school holiday">
                    <AcademicHolidayForm
                      years={yearOptions}
                      terms={terms.map((term) => ({ id: term.id, label: `${term.name} · ${term.yearName}` }))}
                    />
                  </AdminActionDialog>
                }
                records={holidays.map((holiday) => ({
                  id: holiday.id,
                  values: {
                    name: holiday.name,
                    year: holiday.yearName,
                    term: holiday.termName ?? "Whole year",
                    academicYearId: String(holiday.academicYearId),
                    startDate: holiday.startDate,
                    endDate: holiday.endDate,
                  },
                  editForm: (
                    <AcademicHolidayForm
                      years={allYearOptions}
                      terms={terms.map((term) => ({ id: term.id, label: `${term.name} · ${term.yearName}` }))}
                      record={holiday}
                    />
                  ),
                }))}
              />
            )}
            {sectionId === "enrollment" && canViewEnrollmentHistory && (
              <>
                <EnrollmentRecordList
                  toolbarActions={
                    <>
                      {canManageEnrollments && (
                        <AdminActionDialog label="Place student" title="Place student in a class">
                          <StudentPlacementForm
                            branches={branchOptions}
                            students={eligibleStudentOptions}
                            sections={activeSectionOptions}
                          />
                        </AdminActionDialog>
                      )}
                      {canManageEnrollments && (
                        <AdminActionDialog label="Manage enrollment" title="Manage student enrollment">
                          <EnrollmentOperationForm
                            branches={branchOptions}
                            enrollments={enrollmentOptions}
                            years={yearOptions}
                            sections={sections
                              .filter(
                                (section) =>
                                  section.yearStatus !== "archived" &&
                                  section.classStatus === "active",
                              )
                              .map((section) => ({
                                id: section.id,
                                branchId: section.branchId,
                                academicYearId: section.academicYearId,
                                label: `${section.className} ${section.name}`,
                              }))}
                          />
                        </AdminActionDialog>
                      )}
                    </>
                  }
                  enrollments={enrollments.map((enrollment) => ({
                    id: enrollment.id,
                    student: `${enrollment.studentFirstName} ${enrollment.studentLastName}`,
                    className: enrollment.className,
                    section: enrollment.sectionName,
                    academicYear: enrollment.yearName,
                    status: enrollment.status,
                    enrolledAt: enrollment.enrolledAt,
                  }))}
                />
                <AcademicEventList
                  events={academicEvents.map((event) => ({
                    id: event.id,
                    student: `${event.studentFirstName} ${event.studentLastName}`,
                    type: event.eventType.replaceAll("_", " "),
                    date: event.eventDate,
                    fromSection: event.fromClassSectionId
                      ? sectionNameById.get(event.fromClassSectionId) ?? "Previous section"
                      : "",
                    toSection: event.toClassSectionId
                      ? sectionNameById.get(event.toClassSectionId) ?? "Destination section"
                      : "",
                    externalInstitution: event.externalInstitution ?? "",
                    reason: event.reason,
                  }))}
                />
              </>
            )}
            {sectionId === "attendance" && (
              <AttendanceWorkspace
                sections={activeSectionOptions}
                schoolName={context.schoolName}
                selectedSectionId={activeAttendanceSection ? String(activeAttendanceSection.id) : ""}
                attendanceDate={attendanceDate}
                roster={attendanceRoster.map((student) => ({
                  ...student,
                  status:
                    typeof student.status === "string" && isAttendanceStatus(student.status)
                      ? student.status
                      : null,
                }))}
                canManageAttendance={canManageEnrollments}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function RecordList({
  title,
  columns,
  empty,
  records,
  filters,
  toolbarActions,
  initialQuery = "",
}: {
  title: string;
  columns: AdminTableColumn[];
  empty: string;
  records: (AdminTableRow & { editForm?: ReactNode; deleteForm?: ReactNode })[];
  filters?: AdminTableFilter[];
  toolbarActions?: ReactNode;
  initialQuery?: string;
}) {
  return (
    <AdminDataTable
      title={title}
      columns={columns}
      emptyMessage={empty}
      filters={filters}
      initialQuery={initialQuery}
      requireSearchCriteria={Boolean(filters?.length)}
      toolbarActions={toolbarActions}
      rows={records.map(({ id, values, searchableText, editForm, deleteForm }) => ({
        id,
        values,
        searchableText,
        actions: (
          <div className="flex items-center gap-2">
            {editForm && (
              <AdminRecordDialog title={`Edit ${title.toLocaleLowerCase()}`}>
                {editForm}
              </AdminRecordDialog>
            )}
            {deleteForm}
          </div>
        ),
      }))}
    />
  );
}
