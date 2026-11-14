import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import {
  AdminActionDialog,
  AdminDataTable,
  AdminRecordDialog,
  type AdminTableFilter,
} from "@/components/admin-data-table";
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
import { getStudentStatusTransitions } from "@/lib/student-policy";
import { StudentForm } from "./student-form";
import { StudentProfileDetails } from "./student-profile-details";
import { StudentStatusForm } from "./student-status-form";

const statusLabels: Record<string, string> = {
  pending: "Pending review",
  admitted: "Admitted",
  rejected: "Rejected",
  active: "Active",
  inactive: "Inactive",
  disabled: "Disabled",
};
const genderLabels: Record<string, string> = {
  female: "Female",
  male: "Male",
  other: "Other",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string | string[]; search?: string | string[] }>;
}) {
  const { action, search } = await searchParams;
  const openAddStudent = action === "add";
  const initialSearch = typeof search === "string" ? search.slice(0, 120) : "";
  const context = await requireSchoolPermission("students.view");
  const rawRecords = await db
    .select({
      id: students.id,
      publicId: students.publicId,
      firstName: students.firstName,
      lastName: students.lastName,
      gender: students.gender,
      email: students.email,
      phone: students.phone,
      fatherName: students.fatherName,
      categoryId: studentCategories.id,
      categoryName: studentCategories.name,
      admissionNumber: students.admissionNumber,
      dateOfBirth: students.dateOfBirth,
      admissionDate: students.admissionDate,
      religion: students.religion,
      bloodGroup: students.bloodGroup,
      currentAddress: students.currentAddress,
      permanentAddress: students.permanentAddress,
      fatherOccupation: students.fatherOccupation,
      fatherPhone: students.fatherPhone,
      motherName: students.motherName,
      motherOccupation: students.motherOccupation,
      motherPhone: students.motherPhone,
      guardianName: students.guardianName,
      guardianRelation: students.guardianRelation,
      guardianEmail: students.guardianEmail,
      guardianPhone: students.guardianPhone,
      guardianOccupation: students.guardianOccupation,
      guardianAddress: students.guardianAddress,
      additionalDetails: students.additionalDetails,
      status: students.status,
      createdAt: students.createdAt,
      branchId: schoolBranches.id,
      branchName: schoolBranches.name,
      classLevelId: classLevels.id,
      className: classLevels.name,
      classSectionId: classSections.id,
      rollNumber: studentEnrollments.rollNumber,
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
        eq(academicYears.status, "active"),
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
    .where(eq(students.schoolId, context.schoolId))
    .orderBy(desc(students.createdAt));
  const recordGroups = new Map<number, {
    record: (typeof rawRecords)[number];
    classes: Map<number, string>;
    sections: Map<number, string>;
    years: Set<string>;
    rollNumbers: Set<string>;
  }>();
  for (const record of rawRecords) {
    let group = recordGroups.get(record.id);
    if (!group) {
      group = {
        record,
        classes: new Map(),
        sections: new Map(),
        years: new Set(),
        rollNumbers: new Set(),
      };
      recordGroups.set(record.id, group);
    }
    if (record.classLevelId !== null && record.className) {
      group.classes.set(record.classLevelId, record.className);
    }
    if (record.classSectionId !== null && record.sectionName) {
      group.sections.set(record.classSectionId, record.sectionName);
    }
    if (record.academicYearName) group.years.add(record.academicYearName);
    if (record.rollNumber) group.rollNumbers.add(record.rollNumber);
  }
  const records = [...recordGroups.values()].map(({ record, classes, sections, years, rollNumbers }) => ({
    ...record,
    className: [...classes.values()].join(", ") || null,
    sectionName: [...sections.values()].join(", ") || null,
    classLevelId: [...classes.keys()][0] ?? null,
    classSectionId: [...sections.keys()][0] ?? null,
    classFilter: classes.size > 0 ? [...classes.keys()].join("|") : "__unassigned__",
    sectionFilter: sections.size > 0 ? [...sections.keys()].join("|") : "__unassigned__",
    academicYearName: [...years].join(", ") || null,
    rollNumber: [...rollNumbers].join(", ") || null,
  }));
  const tableInitialSearch =
    /^\d+$/.test(initialSearch)
      ? records.find((record) => String(record.id) === initialSearch)?.publicId ?? initialSearch
      : initialSearch;
  const [branches, years, classes, sections, categoryOptions] = await Promise.all([
    db
      .select({
        id: schoolBranches.id,
        name: schoolBranches.name,
        code: schoolBranches.code,
      })
      .from(schoolBranches)
      .where(and(eq(schoolBranches.schoolId, context.schoolId), eq(schoolBranches.status, "active")))
      .orderBy(asc(schoolBranches.name)),
    db
      .select({ id: academicYears.id, name: academicYears.name })
      .from(academicYears)
      .where(and(eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "active")))
      .orderBy(desc(academicYears.startDate)),
    db
      .select({
        id: classLevels.id,
        branchId: classLevels.branchId,
        name: classLevels.name,
        code: classLevels.code,
        branchName: schoolBranches.name,
      })
      .from(classLevels)
      .innerJoin(schoolBranches, eq(classLevels.branchId, schoolBranches.id))
      .where(and(eq(classLevels.schoolId, context.schoolId), eq(schoolBranches.status, "active")))
      .orderBy(asc(schoolBranches.name), asc(classLevels.name)),
    db
      .select({
        id: classSections.id,
        academicYearId: classSections.academicYearId,
        classLevelId: classSections.classLevelId,
        name: classSections.name,
        className: classLevels.name,
        yearName: academicYears.name,
      })
      .from(classSections)
      .innerJoin(
        academicYears,
        and(
          eq(classSections.academicYearId, academicYears.id),
          eq(academicYears.schoolId, context.schoolId),
          eq(academicYears.status, "active"),
        ),
      )
      .innerJoin(classLevels, and(eq(classSections.classLevelId, classLevels.id), eq(classLevels.schoolId, context.schoolId)))
      .where(eq(classSections.schoolId, context.schoolId))
      .orderBy(asc(academicYears.startDate), asc(classLevels.name), asc(classSections.name)),
    db
      .select({
        id: studentCategories.id,
        branchId: studentCategories.branchId,
        name: studentCategories.name,
      })
      .from(studentCategories)
      .innerJoin(schoolBranches, eq(studentCategories.branchId, schoolBranches.id))
      .where(and(eq(studentCategories.schoolId, context.schoolId), eq(schoolBranches.status, "active")))
      .orderBy(asc(studentCategories.name)),
  ]);
  const branchOptions = branches.map((branch) => ({
    id: branch.id,
    label: `${branch.name} · ${branch.code}`,
  }));
  const yearOptions = years.map((year) => ({ id: year.id, label: year.name }));
  const classOptions = classes.map((classLevel) => ({
    id: classLevel.id,
    branchId: classLevel.branchId,
    label: `${classLevel.branchName} · ${classLevel.name} (${classLevel.code})`,
  }));
  const sectionOptions = sections.map((section) => ({
    id: section.id,
    academicYearId: section.academicYearId,
    classLevelId: section.classLevelId,
    label: `${section.className} ${section.name} · ${section.yearName}`,
  }));
  const categorySelectOptions = categoryOptions.map((category) => ({
    id: category.id,
    branchId: category.branchId,
    label: category.name,
  }));
  const filters: AdminTableFilter[] = [
    {
      key: "genderFilter",
      label: "gender",
      options: uniqueOptions(rawRecords.map((record) => ({
        value: record.gender ?? "__unspecified__",
        label: record.gender ? genderLabels[record.gender] ?? record.gender : "Not specified",
      }))),
    },
    {
      key: "branchFilter",
      label: "branch",
      options: uniqueOptions(records.map((record) => ({
        value: record.branchId === null ? "__unassigned__" : String(record.branchId),
        label: record.branchName ?? "Unassigned",
      }))),
    },
    {
      key: "classFilter",
      label: "class",
      options: uniqueOptions(rawRecords.map((record) => ({
        value: record.classLevelId === null ? "__unassigned__" : String(record.classLevelId),
        label: record.className
          ? `${record.branchName} · ${record.className}`
          : "Unassigned",
      }))),
    },
    {
      key: "sectionFilter",
      label: "class section",
      options: uniqueOptions(rawRecords.map((record) => ({
        value: record.classSectionId === null ? "__unassigned__" : String(record.classSectionId),
        label: record.sectionName
          ? `${record.className} ${record.sectionName} · ${record.academicYearName}`
          : "Unassigned",
      }))),
    },
    {
      key: "statusFilter",
      label: "status",
      options: uniqueOptions(records.map((record) => ({
        value: record.status,
        label: statusLabels[record.status] ?? record.status,
      }))),
    },
    {
      key: "categoryFilter",
      label: "category",
      options: uniqueOptions(records.map((record) => ({
        value: record.categoryId === null ? "__uncategorized__" : String(record.categoryId),
        label: record.categoryName ?? "Uncategorized",
      }))),
    },
  ];
  const canCreate = context.grantedPermissions.includes("students.create");
  const canUpdate = context.grantedPermissions.includes("students.update");

  return (
    <div className="space-y-8">
      <div className="print:hidden flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">Phase 2</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Student records</h1>
        </div>
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Back to overview
          <ArrowUpRight size={16} />
        </Link>
        <Link
          href="/admin/students/categories"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Student categories
        </Link>
        <Link
          href="/admin/students/multi-class"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Multi-class student
        </Link>
      </div>

      <div className="print:block">
        <AdminDataTable
          key={tableInitialSearch}
          title="Student directory"
          columns={[
            { key: "admissionNumber", label: "Admission No" },
            { key: "name", label: "Name" },
            { key: "fatherName", label: "Father Name" },
            { key: "dateOfBirth", label: "Date Of Birth" },
            { key: "classSection", label: "Class (Sec.)" },
            { key: "gender", label: "Gender" },
            { key: "type", label: "Type" },
            { key: "phone", label: "Phone" },
          ]}
          filters={filters}
          requireSearchCriteria
          initialQuery={tableInitialSearch}
          showAllRecordsLabel="Show all sections"
          hideDefaultView
          showRowNumber={false}
          toolbarActions={canCreate ? (
            <AdminActionDialog
              label="Add student"
              title="Add student record"
              initialOpen={openAddStudent}
            >
              <StudentForm
                branches={branchOptions}
                years={yearOptions}
                classes={classOptions}
                sections={sectionOptions}
                categories={categorySelectOptions}
              />
            </AdminActionDialog>
          ) : null}
          rows={records.map((record) => ({
            id: record.id,
            values: {
              studentId: record.publicId,
              admissionNumber: record.admissionNumber ?? "",
              name: `${record.firstName} ${record.lastName}`,
              fatherName: record.fatherName ?? "",
              rollNumber: record.rollNumber ?? "",
              gender: record.gender ? genderLabels[record.gender] ?? record.gender : "Not specified",
              dateOfBirth: record.dateOfBirth ?? "",
              email: record.email ?? "",
              phone: record.phone ?? "",
              branch: record.branchName ?? "Unassigned",
              category: record.categoryName ?? "",
              type: record.categoryName ?? "",
              categoryFilter: record.categoryId === null ? "__uncategorized__" : String(record.categoryId),
              class: record.className ?? "Unassigned",
              classSection: record.sectionName
                ? `${record.className ?? "Unassigned"} (${record.sectionName})`
                : record.className ?? "Unassigned",
              section: record.sectionName
                ? `${record.sectionName} · ${record.academicYearName}`
                : "Unassigned",
              branchFilter: record.branchId === null ? "__unassigned__" : String(record.branchId),
              classFilter: record.classFilter,
              sectionFilter: record.sectionFilter,
              genderFilter: record.gender ?? "__unspecified__",
              statusFilter: record.status,
              status: statusLabels[record.status] ?? record.status,
              createdAt: new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(record.createdAt),
              religion: record.religion ?? "",
              bloodGroup: record.bloodGroup ?? "",
              currentAddress: record.currentAddress ?? "",
              permanentAddress: record.permanentAddress ?? "",
              fatherOccupation: record.fatherOccupation ?? "",
              fatherPhone: record.fatherPhone ?? "",
              motherName: record.motherName ?? "",
              motherOccupation: record.motherOccupation ?? "",
              motherPhone: record.motherPhone ?? "",
              guardianName: record.guardianName ?? "",
              guardianRelation: record.guardianRelation ?? "",
              guardianEmail: record.guardianEmail ?? "",
              guardianPhone: record.guardianPhone ?? "",
              guardianOccupation: record.guardianOccupation ?? "",
              guardianAddress: record.guardianAddress ?? "",
            },
            actions: (
              <div className="flex min-w-32 flex-wrap items-center gap-2">
                <AdminRecordDialog
                  title={`${record.firstName} ${record.lastName}`}
                  mode="view"
                  wide
                >
                  <StudentProfileDetails
                    studentName={`${record.firstName} ${record.lastName}`}
                    admissionNumber={record.admissionNumber}
                    photoUrl={record.additionalDetails?.profilePhoto?.objectKey
                      ? `/api/admin/students/${record.publicId}/photo`
                      : null}
                    fields={[
                      { tab: "personal", label: "Student ID", value: record.publicId },
                      { tab: "personal", label: "Admission number", value: record.admissionNumber },
                      { tab: "personal", label: "Roll number", value: record.rollNumber },
                      { tab: "personal", label: "Admission status", value: statusLabels[record.status] ?? record.status },
                      { tab: "personal", label: "Admission date", value: record.admissionDate },
                      { tab: "personal", label: "Date of birth", value: record.dateOfBirth },
                      { tab: "personal", label: "Gender", value: record.gender ? genderLabels[record.gender] ?? record.gender : null },
                      { tab: "personal", label: "Email", value: record.email },
                      { tab: "personal", label: "Phone", value: record.phone },
                      { tab: "personal", label: "Branch", value: record.branchName },
                      { tab: "personal", label: "Category", value: record.categoryName },
                      { tab: "personal", label: "Class", value: record.className },
                      { tab: "personal", label: "Section", value: record.sectionName },
                      { tab: "personal", label: "Academic year", value: record.academicYearName },
                      { tab: "personal", label: "Religion", value: record.religion },
                      { tab: "personal", label: "Blood group", value: record.bloodGroup },
                      { tab: "personal", label: "Current address", value: record.currentAddress },
                      { tab: "personal", label: "Permanent address", value: record.permanentAddress },
                      { tab: "personal", label: "Caste", value: record.additionalDetails?.caste ?? null },
                      { tab: "personal", label: "Height (inches)", value: record.additionalDetails?.heightInches ?? null },
                      { tab: "personal", label: "Weight (kg)", value: record.additionalDetails?.weightKg ?? null },
                      { tab: "parents", label: "Father / guardian 1", value: record.fatherName },
                      { tab: "parents", label: "Father occupation", value: record.fatherOccupation },
                      { tab: "parents", label: "Father phone", value: record.fatherPhone },
                      { tab: "parents", label: "Mother / guardian 2", value: record.motherName },
                      { tab: "parents", label: "Mother occupation", value: record.motherOccupation },
                      { tab: "parents", label: "Mother phone", value: record.motherPhone },
                      { tab: "parents", label: "Guardian", value: record.guardianName },
                      { tab: "parents", label: "Guardian relationship", value: record.guardianRelation },
                      { tab: "parents", label: "Guardian email", value: record.guardianEmail },
                      { tab: "parents", label: "Guardian phone", value: record.guardianPhone },
                      { tab: "parents", label: "Guardian occupation", value: record.guardianOccupation },
                      { tab: "parents", label: "Guardian address", value: record.guardianAddress },
                      { tab: "documents", label: "National ID number", value: record.additionalDetails?.nationalIdNumber ?? null },
                      { tab: "documents", label: "Birth certificate number", value: record.additionalDetails?.birthCertificateNumber ?? null },
                      { tab: "documents", label: "Additional notes", value: record.additionalDetails?.additionalNotes ?? null },
                      { tab: "documents", label: "Bank name", value: record.additionalDetails?.bankName ?? null },
                      { tab: "documents", label: "Bank account number", value: record.additionalDetails?.bankAccountNumber ?? null },
                      { tab: "documents", label: "IFSC / bank routing code", value: record.additionalDetails?.bankIfscCode ?? null },
                      ...Array.from({ length: 4 }, (_, index) => {
                        const slot = index + 1;
                        const document = record.additionalDetails?.documents?.[index];
                        return {
                          tab: "documents" as const,
                          label: `Document ${slot}`,
                          value: document?.title || document?.fileName || null,
                          ...(document?.objectKey
                            ? { href: `/api/admin/students/${record.publicId}/documents/${slot}` }
                            : {}),
                        };
                      }),
                      { tab: "previous", label: "Previous school details", value: record.additionalDetails?.previousSchoolDetails ?? null },
                      { tab: "other", label: "Transport route", value: record.additionalDetails?.transportRoute ?? null },
                      { tab: "other", label: "Vehicle number", value: record.additionalDetails?.vehicleNumber ?? null },
                      { tab: "other", label: "Dormitory", value: record.additionalDetails?.dormitoryName ?? null },
                      { tab: "other", label: "Room number", value: record.additionalDetails?.dormitoryRoom ?? null },
                      { tab: "custom", label: record.additionalDetails?.customFieldName || "Custom field", value: record.additionalDetails?.customFieldValue ?? null },
                    ]}
                  />
                </AdminRecordDialog>
                {canUpdate && (
                  <AdminRecordDialog title={`Edit ${record.firstName} ${record.lastName}`} wide>
                    <StudentForm
                      branches={branchOptions}
                      years={yearOptions}
                      classes={classOptions}
                      sections={sectionOptions}
                      categories={categorySelectOptions}
                      record={record}
                    />
                  </AdminRecordDialog>
                )}
                {canUpdate && getStudentStatusTransitions(record.status).map((nextStatus) => (
                  <StudentStatusForm
                    key={nextStatus}
                    publicId={record.publicId}
                    studentName={`${record.firstName} ${record.lastName}`}
                    currentStatus={record.status}
                    nextStatus={nextStatus}
                  />
                ))}
              </div>
            ),
          }))}
          emptyMessage="No student records yet. Add the first record to begin tracking admissions."
        />
      </div>
    </div>
  );
}


function uniqueOptions(options: { value: string; label: string }[]) {
  return [...new Map(options.map((option) => [option.value, option])).values()];
}
