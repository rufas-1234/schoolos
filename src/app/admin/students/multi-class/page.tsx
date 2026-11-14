import { and, asc, eq, inArray } from "drizzle-orm";
import {
  AdminActionDialog,
  AdminDataTable,
  AdminDeleteButton,
  AdminRecordDialog,
} from "@/components/admin-data-table";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  schoolBranches,
  studentEnrollments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { removeStudentClass } from "../class-actions";
import { StudentClassForm } from "../student-class-form";

type SearchParam = string | string[] | undefined;
type SearchParams = {
  branchId?: SearchParam;
  academicYearId?: SearchParam;
  classLevelId?: SearchParam;
  sectionId?: SearchParam;
  studentPublicId?: SearchParam;
};

function singleValue(value: SearchParam): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function positiveId(value: SearchParam): number | null {
  if (typeof value !== "string") return null;
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function MultiClassStudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSchoolPermission("students.view");
  const params = await searchParams;
  const branchValue = singleValue(params.branchId);
  const yearValue = singleValue(params.academicYearId);
  const classValue = singleValue(params.classLevelId);
  const sectionValue = singleValue(params.sectionId);
  const studentPublicId = singleValue(params.studentPublicId);
  const branchId = positiveId(branchValue);
  const academicYearId = positiveId(yearValue);
  const classLevelId = positiveId(classValue);
  const sectionId = positiveId(sectionValue);
  const [branches, years, classes] = await Promise.all([
    db
      .select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code })
      .from(schoolBranches)
      .where(and(eq(schoolBranches.schoolId, context.schoolId), eq(schoolBranches.status, "active")))
      .orderBy(asc(schoolBranches.name)),
    db
      .select({ id: academicYears.id, name: academicYears.name })
      .from(academicYears)
      .where(and(eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "active")))
      .orderBy(asc(academicYears.startDate)),
    db
      .select({ id: classLevels.id, branchId: classLevels.branchId, name: classLevels.name })
      .from(classLevels)
      .innerJoin(schoolBranches, eq(classLevels.branchId, schoolBranches.id))
      .where(
        and(
          eq(classLevels.schoolId, context.schoolId),
          eq(schoolBranches.status, "active"),
          ...(branchId === null ? [] : [eq(classLevels.branchId, branchId)]),
        ),
      )
      .orderBy(asc(classLevels.name)),
  ]);
  const sections = branchId !== null && academicYearId !== null
    ? await db
        .select({
          id: classSections.id,
          classLevelId: classSections.classLevelId,
          name: classSections.name,
          className: classLevels.name,
        })
        .from(classSections)
        .innerJoin(
          classLevels,
          and(
            eq(classSections.classLevelId, classLevels.id),
            eq(classLevels.branchId, branchId),
            eq(classLevels.schoolId, context.schoolId),
          ),
        )
        .innerJoin(
          academicYears,
          and(
            eq(classSections.academicYearId, academicYears.id),
            eq(academicYears.schoolId, context.schoolId),
            eq(academicYears.status, "active"),
          ),
        )
        .where(
          and(
            eq(classSections.schoolId, context.schoolId),
            eq(classSections.academicYearId, academicYearId),
            ...(classLevelId === null ? [] : [eq(classSections.classLevelId, classLevelId)]),
          ),
        )
        .orderBy(asc(classLevels.name), asc(classSections.name))
    : [];
  const sectionOptions = sections.map((section) => ({
    id: section.id,
    label: `${section.className} · ${section.name}`,
  }));
  const selectedSection = sections.find((section) => section.id === sectionId);
  const selectedClass = classes.find((classLevel) => classLevel.id === classLevelId);
  const sourceCriteriaValid =
    branchId !== null &&
    academicYearId !== null &&
    classLevelId !== null &&
    sectionId !== null;
  const validSource =
    sourceCriteriaValid &&
    selectedSection !== undefined &&
    selectedClass !== undefined &&
    selectedSection.classLevelId === classLevelId &&
    selectedClass.branchId === branchId;
  const classSectionCriteriaRequired =
    branchId !== null &&
    academicYearId !== null &&
    classes.length > 0 &&
    sections.length > 0;
  const eligibleStudents = validSource
    ? await db
        .select({
          id: students.id,
          publicId: students.publicId,
          firstName: students.firstName,
          lastName: students.lastName,
          admissionNumber: students.admissionNumber,
        })
        .from(studentEnrollments)
        .innerJoin(students, eq(studentEnrollments.studentId, students.id))
        .where(
          and(
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.academicYearId, academicYearId!),
            eq(studentEnrollments.classSectionId, sectionId!),
            inArray(studentEnrollments.status, ["pending", "enrolled"]),
            eq(students.schoolId, context.schoolId),
            inArray(students.status, ["pending", "admitted", "active"]),
          ),
        )
        .orderBy(asc(students.lastName), asc(students.firstName))
    : [];
  const selectedStudent = studentPublicId
    ? eligibleStudents.find(
        (student) => student.publicId === studentPublicId,
      )
    : undefined;
  const assignments = selectedStudent && academicYearId !== null
    ? await db
        .select({
          id: studentEnrollments.id,
          publicId: studentEnrollments.publicId,
          classSectionId: classSections.id,
          className: classLevels.name,
          sectionName: classSections.name,
          rollNumber: studentEnrollments.rollNumber,
          status: studentEnrollments.status,
          enrolledAt: studentEnrollments.enrolledAt,
        })
        .from(studentEnrollments)
        .innerJoin(students, eq(studentEnrollments.studentId, students.id))
        .innerJoin(classSections, eq(studentEnrollments.classSectionId, classSections.id))
        .innerJoin(classLevels, eq(classSections.classLevelId, classLevels.id))
        .where(
          and(
            eq(studentEnrollments.schoolId, context.schoolId),
            eq(studentEnrollments.studentId, selectedStudent.id),
            eq(studentEnrollments.academicYearId, academicYearId),
            inArray(studentEnrollments.status, ["pending", "enrolled"]),
            eq(students.schoolId, context.schoolId),
            eq(classLevels.branchId, branchId!),
          ),
        )
        .orderBy(asc(classLevels.name), asc(classSections.name))
    : [];
  const canUpdate = context.grantedPermissions.includes("students.update");
  const studentLabel = selectedStudent
    ? `${selectedStudent.firstName} ${selectedStudent.lastName}${selectedStudent.admissionNumber ? ` (${selectedStudent.admissionNumber})` : ""}`
    : "";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">Student Info</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Multi-class student
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage a student&apos;s class and section assignments within an academic year.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Select criteria</h2>
        <p className="mt-1 text-sm text-slate-500">
          Select a branch and academic year first. Then choose a class and section to load students.
        </p>
        <form method="get" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Branch <span className="text-rose-600" aria-hidden="true">*</span>
            <select name="branchId" required defaultValue={branchValue ?? ""} className={inputClass}>
              <option value="" disabled>Select branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Academic year <span className="text-rose-600" aria-hidden="true">*</span>
            <select name="academicYearId" required defaultValue={yearValue ?? ""} className={inputClass}>
              <option value="" disabled>Select academic year</option>
              {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Class {classSectionCriteriaRequired && <span className="text-rose-600" aria-hidden="true">*</span>}
            <select name="classLevelId" required={classSectionCriteriaRequired} defaultValue={classValue ?? ""} className={inputClass}>
              <option value="" disabled>Select class</option>
              {classes.map((classLevel) => <option key={classLevel.id} value={classLevel.id}>{classLevel.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Section {classSectionCriteriaRequired && <span className="text-rose-600" aria-hidden="true">*</span>}
            <select name="sectionId" required={classSectionCriteriaRequired} defaultValue={sectionValue ?? ""} className={inputClass}>
              <option value="" disabled>Select section</option>
              {sectionOptions.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            Student
            <select name="studentPublicId" defaultValue={studentPublicId ?? ""} className={inputClass}>
              <option value="" disabled>Select student</option>
              {eligibleStudents.map((student) => (
                <option key={student.publicId} value={student.publicId}>
                  {student.firstName} {student.lastName}{student.admissionNumber ? ` · ${student.admissionNumber}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 sm:w-auto">
              Search
            </button>
          </div>
        </form>
        {branchId !== null && academicYearId !== null && classes.length === 0 && (
          <p role="status" className="mt-4 text-sm text-amber-700">
            No active classes are available for this branch.
          </p>
        )}
        {validSource && eligibleStudents.length > 0 && !selectedStudent && (
          <p role="status" className="mt-4 text-sm text-slate-500">
            Select a student and search to view their class assignments.
          </p>
        )}
        {studentPublicId && sourceCriteriaValid && !selectedStudent && (
          <p role="status" className="mt-4 text-sm text-amber-700">
            This student is not currently assigned to the selected source section.
          </p>
        )}
        {validSource && eligibleStudents.length === 0 && (
          <p role="status" className="mt-4 text-sm text-slate-500">
            No students are currently assigned to the selected section.
          </p>
        )}
      </section>

      {selectedStudent && (
        <AdminDataTable
          title={`${studentLabel} · Class assignments`}
          columns={[
            { key: "className", label: "Class" },
            { key: "sectionName", label: "Section" },
            { key: "rollNumber", label: "Roll number" },
            { key: "status", label: "Enrollment status" },
            { key: "enrolledAt", label: "Enrolled date" },
          ]}
          rows={assignments.map((assignment) => ({
            id: assignment.id,
            values: {
              className: assignment.className,
              sectionName: assignment.sectionName,
              rollNumber: assignment.rollNumber ?? "",
              status: assignment.status === "enrolled" ? "Enrolled" : "Pending",
              enrolledAt: assignment.enrolledAt,
            },
            actions: canUpdate ? (
              <div className="flex items-center gap-2">
                <AdminRecordDialog title={`Edit ${assignment.className} ${assignment.sectionName}`}>
                  <StudentClassForm
                    sections={sectionOptions}
                    studentPublicId={selectedStudent.publicId}
                    record={{
                      publicId: assignment.publicId,
                      classSectionId: assignment.classSectionId,
                      rollNumber: assignment.rollNumber,
                    }}
                  />
                </AdminRecordDialog>
                <form action={removeStudentClass}>
                  <input type="hidden" name="enrollmentPublicId" value={assignment.publicId} />
                  <AdminDeleteButton label={`Remove ${assignment.className} ${assignment.sectionName}`} />
                </form>
              </div>
            ) : null,
          }))}
          toolbarActions={canUpdate ? (
            <AdminActionDialog label="Add class" title={`Add class for ${studentLabel}`}>
              <StudentClassForm
                sections={sectionOptions}
                studentPublicId={selectedStudent.publicId}
                studentLabel={studentLabel}
                branchId={branchId ?? undefined}
                academicYearId={academicYearId ?? undefined}
                sourceSectionId={sectionId ?? undefined}
              />
            </AdminActionDialog>
          ) : null}
          searchCriteriaSelected
          emptyMessage="No active class assignments are recorded for this student in the selected academic year."
        />
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white";
