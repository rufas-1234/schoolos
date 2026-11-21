import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { AdminConfirmSubmitButton, AdminDataTable, type AdminTableFilter } from "@/components/admin-data-table";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  classSections,
  schoolBranches,
  studentCategories,
  studentEnrollments,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { transitionStudentStatusDirect } from "../actions";

export default async function DisabledStudentsPage() {
  const context = await requireSchoolPermission("students.view");
  const rawRecords = await db
    .select({
      id: students.id,
      publicId: students.publicId,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      phone: students.phone,
      gender: students.gender,
      categoryId: studentCategories.id,
      categoryName: studentCategories.name,
      branchId: schoolBranches.id,
      branchName: schoolBranches.name,
      classLevelId: classLevels.id,
      className: classLevels.name,
      classSectionId: classSections.id,
      sectionName: classSections.name,
      academicYearName: academicYears.name,
    })
    .from(students)
    .leftJoin(
      studentCategories,
      and(
        eq(studentCategories.id, students.categoryId),
        eq(studentCategories.schoolId, context.schoolId),
      ),
    )
    .leftJoin(
      studentEnrollments,
      and(
        eq(studentEnrollments.studentId, students.id),
        eq(studentEnrollments.schoolId, context.schoolId),
        inArray(studentEnrollments.status, ["pending", "enrolled"]),
      ),
    )
    .leftJoin(
      academicYears,
      and(
        eq(academicYears.id, studentEnrollments.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ),
    )
    .leftJoin(
      classSections,
      and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
        eq(classSections.academicYearId, academicYears.id),
      ),
    )
    .leftJoin(
      classLevels,
      and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ),
    )
    .leftJoin(
      schoolBranches,
      and(
        eq(schoolBranches.id, sql`coalesce(${students.branchId}, ${classLevels.branchId})`),
        eq(schoolBranches.schoolId, context.schoolId),
      ),
    )
    .where(and(eq(students.schoolId, context.schoolId), eq(students.status, "disabled")))
    .orderBy(asc(students.lastName), asc(students.firstName));

  const grouped = new Map<number, {
    record: (typeof rawRecords)[number];
    classes: Map<number, string>;
    sections: Map<number, string>;
    years: Set<string>;
  }>();
  for (const record of rawRecords) {
    let group = grouped.get(record.id);
    if (!group) {
      group = { record, classes: new Map(), sections: new Map(), years: new Set() };
      grouped.set(record.id, group);
    }
    if (record.classLevelId !== null && record.className) group.classes.set(record.classLevelId, record.className);
    if (record.classSectionId !== null && record.sectionName) group.sections.set(record.classSectionId, record.sectionName);
    if (record.academicYearName) group.years.add(record.academicYearName);
  }
  const records = [...grouped.values()].map(({ record, classes, sections, years }) => ({
    ...record,
    className: [...classes.values()].join(", ") || null,
    classLevelId: [...classes.keys()][0] ?? null,
    classFilter: classes.size ? [...classes.keys()].join("|") : "__unassigned__",
    sectionName: [...sections.values()].join(", ") || null,
    sectionFilter: sections.size ? [...sections.keys()].join("|") : "__unassigned__",
    academicYearName: [...years].join(", ") || null,
  }));
  const canUpdate = context.grantedPermissions.includes("students.update");
  const filters: AdminTableFilter[] = [{
    key: "genderFilter",
    label: "gender",
    options: uniqueOptions(records.map((record) => ({
      value: record.gender ?? "__unspecified__",
      label: record.gender ? genderLabels[record.gender] ?? record.gender : "Not specified",
    }))),
  }, {
    key: "branchFilter",
    label: "branch",
    options: uniqueOptions(records.map((record) => ({
      value: record.branchId === null ? "__unassigned__" : String(record.branchId),
      label: record.branchName ?? "Unassigned",
    }))),
  }, {
    key: "classFilter",
    label: "class",
    options: uniqueOptions(rawRecords.map((record) => ({
      value: record.classLevelId === null ? "__unassigned__" : String(record.classLevelId),
      label: record.className ? `${record.branchName ?? "Unassigned"} · ${record.className}` : "Unassigned",
    }))),
  }, {
    key: "sectionFilter",
    label: "class section",
    options: uniqueOptions(rawRecords.map((record) => ({
      value: record.classSectionId === null ? "__unassigned__" : String(record.classSectionId),
      label: record.sectionName
        ? `${record.className ?? "Unassigned"} ${record.sectionName}${record.academicYearName ? ` · ${record.academicYearName}` : ""}`
        : "Unassigned",
    }))),
  }, {
    key: "categoryFilter",
    label: "category",
    options: uniqueOptions(records.map((record) => ({
      value: record.categoryId === null ? "__uncategorized__" : String(record.categoryId),
      label: record.categoryName ?? "Uncategorized",
    }))),
  }];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">Student Info</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Disabled students
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Review disabled student records and restore eligible students to active status.
        </p>
      </header>

      <AdminDataTable
        title="Disabled students"
        columns={[
          { key: "student", label: "Student" },
          { key: "admissionNumber", label: "Admission number" },
          { key: "branch", label: "Branch" },
          { key: "classSection", label: "Class (section)" },
          { key: "gender", label: "Gender" },
          { key: "category", label: "Category" },
          { key: "phone", label: "Contact" },
        ]}
        rows={records.map((record) => ({
          id: record.id,
          values: {
            student: `${record.firstName} ${record.lastName}`,
            admissionNumber: record.admissionNumber ?? "",
            branch: record.branchName ?? "Not assigned",
            branchFilter: record.branchId === null ? "__unassigned__" : String(record.branchId),
            classSection: record.sectionName
              ? `${record.className ?? "Unassigned"} (${record.sectionName})`
              : record.className ?? "Unassigned",
            classFilter: record.classFilter,
            sectionFilter: record.sectionFilter,
            gender: record.gender ? genderLabels[record.gender] ?? record.gender : "Not specified",
            genderFilter: record.gender ?? "__unspecified__",
            category: record.categoryName ?? "Uncategorized",
            categoryFilter: record.categoryId === null ? "__uncategorized__" : String(record.categoryId),
            phone: record.phone ?? "",
          },
          searchableText: [
            record.firstName,
            record.lastName,
            record.admissionNumber ?? "",
            record.branchName ?? "",
            record.className ?? "",
            record.sectionName ?? "",
            record.categoryName ?? "",
            record.phone ?? "",
          ].join(" "),
          actions: canUpdate ? (
            <form action={transitionStudentStatusDirect}>
              <input type="hidden" name="publicId" value={record.publicId} />
              <input type="hidden" name="nextStatus" value="active" />
              <AdminConfirmSubmitButton
                label={`Restore ${record.firstName} ${record.lastName}`}
                buttonText="Restore"
                confirmationTitle="Confirm student restoration"
                confirmationMessage={`Restore ${record.firstName} ${record.lastName} to active status?`}
                variant="primary"
              />
            </form>
          ) : null,
        }))}
        filters={filters}
        requireSearchCriteria
        emptyMessage="There are no disabled student records."
      />
    </div>
  );
}

const genderLabels: Record<string, string> = {
  female: "Female",
  male: "Male",
  other: "Other",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

function uniqueOptions(options: { value: string; label: string }[]) {
  return [...new Map(options.map((option) => [option.value, option])).values()]
    .sort((first, second) => first.label.localeCompare(second.label));
}
