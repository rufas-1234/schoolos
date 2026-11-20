import { and, asc, eq, inArray } from "drizzle-orm";
import type { ReactNode } from "react";
import { db } from "@/db";
import { AdminRecordDialog } from "@/components/admin-data-table";
import { TablePagination } from "@/components/table-pagination";
import { parsePageSize } from "@/components/pagination-utils";
import {
  academicTerms,
  academicYears,
  classLevels,
  feeDiscounts,
  feeGroups,
  feeStructures,
  feeTypes,
  schools,
  schoolBranches,
  studentFeeDiscounts,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { feeDisplayName } from "@/lib/fees-policy";
import {
  FeeDiscountForm,
  DeleteFeeRecordForm,
  FeeGroupForm,
  FeeStructureForm,
  FeeTypeForm,
  GenerateInvoicesForm,
  StudentFeeDiscountForm,
  type FeeOption,
} from "./fee-forms";

const feesSections = ["catalog", "discounts", "structure", "invoices"] as const;
type FeesSection = (typeof feesSections)[number];

const feesSectionLabels: Record<FeesSection, string> = {
  catalog: "Fee setup",
  discounts: "Scholarships & discounts",
  structure: "Set up fee structure",
  invoices: "Generate student invoices",
};

export default async function FeesSetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string;
    pageSize?: string | string[];
    groupsPage?: string | string[];
    typesPage?: string | string[];
    discountsPage?: string | string[];
    assignmentsPage?: string | string[];
    structuresPage?: string | string[];
  }>;
}) {
  const [context, query] = await Promise.all([
    requireSchoolPermission("fees.manage"),
    searchParams,
  ]);
  const section = query.section === "structures"
    ? "structure"
    : feesSections.find((candidate) => candidate === query.section) ?? "catalog";
  const pageSize = parsePageSize(query.pageSize);
  const requestedPage = (value: string | string[] | undefined) => {
    const parsed = Number(Array.isArray(value) ? value[0] : value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
  };
  const [school, branches, years, terms, classes, groups, types, discounts, studentDiscountAssignments, eligibleStudents, structures] =
    await Promise.all([
      db.select({ currency: schools.currency }).from(schools).where(eq(schools.id, context.schoolId)).then((rows) => rows[0]),
      db.select({ id: schoolBranches.id, name: schoolBranches.name })
        .from(schoolBranches)
        .where(and(eq(schoolBranches.schoolId, context.schoolId), eq(schoolBranches.status, "active")))
        .orderBy(asc(schoolBranches.name)),
      db.select({ id: academicYears.id, name: academicYears.name })
        .from(academicYears)
        .where(eq(academicYears.schoolId, context.schoolId))
        .orderBy(asc(academicYears.startDate)),
      db.select({
        id: academicTerms.id,
        name: academicTerms.name,
        yearName: academicYears.name,
        startDate: academicTerms.startDate,
        endDate: academicTerms.endDate,
        academicYearId: academicTerms.academicYearId,
      })
        .from(academicTerms)
        .innerJoin(academicYears, eq(academicTerms.academicYearId, academicYears.id))
        .where(eq(academicTerms.schoolId, context.schoolId))
        .orderBy(asc(academicTerms.startDate)),
      db.select({
        id: classLevels.id,
        name: classLevels.name,
        branchName: schoolBranches.name,
        status: classLevels.status,
        branchStatus: schoolBranches.status,
      })
        .from(classLevels)
        .innerJoin(schoolBranches, eq(classLevels.branchId, schoolBranches.id))
        .where(and(
          eq(classLevels.schoolId, context.schoolId),
          eq(schoolBranches.schoolId, context.schoolId),
        ))
        .orderBy(asc(schoolBranches.name), asc(classLevels.name)),
      db.select({ id: feeGroups.id, name: feeGroups.name, description: feeGroups.description })
        .from(feeGroups)
        .where(eq(feeGroups.schoolId, context.schoolId))
        .orderBy(asc(feeGroups.name)),
      db.select({
        id: feeTypes.id,
        name: feeTypes.name,
        description: feeTypes.description,
        feeGroupId: feeTypes.feeGroupId,
        groupName: feeGroups.name,
      })
        .from(feeTypes)
        .innerJoin(feeGroups, eq(feeTypes.feeGroupId, feeGroups.id))
        .where(eq(feeTypes.schoolId, context.schoolId))
        .orderBy(asc(feeGroups.name), asc(feeTypes.name)),
      db.select({
        id: feeDiscounts.id,
        description: feeDiscounts.description,
        name: feeDiscounts.name,
        code: feeDiscounts.code,
        discountType: feeDiscounts.discountType,
        value: feeDiscounts.value,
        frequency: feeDiscounts.frequency,
      })
        .from(feeDiscounts)
        .where(eq(feeDiscounts.schoolId, context.schoolId))
        .orderBy(asc(feeDiscounts.name)),
      db.select({
        id: studentFeeDiscounts.id,
        studentId: studentFeeDiscounts.studentId,
        feeTypeId: studentFeeDiscounts.feeTypeId,
        discountId: studentFeeDiscounts.discountId,
        note: studentFeeDiscounts.note,
        studentName: students.firstName,
        studentLastName: students.lastName,
        feeTypeName: feeTypes.name,
        discountName: feeDiscounts.name,
      })
        .from(studentFeeDiscounts)
        .innerJoin(students, and(
          eq(students.id, studentFeeDiscounts.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .innerJoin(feeTypes, and(
          eq(feeTypes.id, studentFeeDiscounts.feeTypeId),
          eq(feeTypes.schoolId, context.schoolId),
        ))
        .innerJoin(feeDiscounts, and(
          eq(feeDiscounts.id, studentFeeDiscounts.discountId),
          eq(feeDiscounts.schoolId, context.schoolId),
        ))
        .where(eq(studentFeeDiscounts.schoolId, context.schoolId))
        .orderBy(asc(students.lastName), asc(students.firstName)),
      db.select({
        id: students.id,
        name: students.firstName,
        lastName: students.lastName,
        admissionNumber: students.admissionNumber,
      })
        .from(students)
        .where(and(eq(students.schoolId, context.schoolId), inArray(students.status, ["admitted", "active"])))
        .orderBy(asc(students.firstName), asc(students.lastName))
        .then((rows) => rows.filter((student) => student.id && student.admissionNumber !== undefined)),
      db.select({
        id: feeStructures.id,
        branchId: feeStructures.branchId,
        academicYearId: feeStructures.academicYearId,
        academicTermId: feeStructures.academicTermId,
        studentId: feeStructures.studentId,
        classLevelId: feeStructures.classLevelId,
        feeGroupId: feeStructures.feeGroupId,
        feeTypeId: feeStructures.feeTypeId,
        fineType: feeStructures.fineType,
        fineValue: feeStructures.fineValue,
        className: classLevels.name,
        yearName: academicYears.name,
        groupName: feeGroups.name,
        typeName: feeTypes.name,
        amount: feeStructures.amount,
        dueDate: feeStructures.dueDate,
        termName: academicTerms.name,
        studentName: students.firstName,
        studentLastName: students.lastName,
        branchName: schoolBranches.name,
      })
        .from(feeStructures)
        .innerJoin(classLevels, eq(feeStructures.classLevelId, classLevels.id))
        .innerJoin(academicYears, eq(feeStructures.academicYearId, academicYears.id))
        .leftJoin(academicTerms, eq(feeStructures.academicTermId, academicTerms.id))
        .leftJoin(students, and(
          eq(students.id, feeStructures.studentId),
          eq(students.schoolId, context.schoolId),
        ))
        .innerJoin(feeGroups, eq(feeStructures.feeGroupId, feeGroups.id))
        .innerJoin(feeTypes, eq(feeStructures.feeTypeId, feeTypes.id))
        .innerJoin(schoolBranches, eq(feeStructures.branchId, schoolBranches.id))
        .where(eq(feeStructures.schoolId, context.schoolId))
        .orderBy(asc(academicYears.startDate), asc(classLevels.name)),
    ]);

  const paginateRows = <T,>(rows: T[], requested: number) => {
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(requested, pageCount);
    return {
      page,
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
    };
  };
  const groupPage = paginateRows(groups, requestedPage(query.groupsPage));
  const typePage = paginateRows(types, requestedPage(query.typesPage));
  const discountPage = paginateRows(discounts, requestedPage(query.discountsPage));
  const assignmentPage = paginateRows(studentDiscountAssignments, requestedPage(query.assignmentsPage));
  const structurePage = paginateRows(structures, requestedPage(query.structuresPage));
  const paginationHref = (parameter: string, page: number) => {
    const params = new URLSearchParams({
      section,
      pageSize: String(pageSize),
      [parameter]: String(page),
    });
    return `/admin/fees?${params.toString()}`;
  };

  const studentsForDiscounts: FeeOption[] = eligibleStudents.map((student) => ({
    id: student.id,
    label: `${student.name} ${student.lastName}${student.admissionNumber ? ` (${student.admissionNumber})` : ""}`,
  }));
  const branchOptions: FeeOption[] = branches.map((branch) => ({ id: branch.id, label: branch.name }));
  const yearOptions: FeeOption[] = years.map((year) => ({ id: year.id, label: year.name }));
  const termOptions: FeeOption[] = terms.map((term) => ({
    id: term.id,
    label: `${term.yearName} · ${term.name} (${term.startDate} – ${term.endDate})`,
  }));
  const classOptions: FeeOption[] = classes
    .filter((item) => item.status === "active" && item.branchStatus === "active")
    .map((item) => ({
      id: item.id,
      label: `${item.branchName} · ${item.name}`,
    }));
  const unavailableClasses = classes
    .filter((item) => item.status !== "active" || item.branchStatus !== "active")
    .map((item) => ({
      id: item.id,
      label: `${item.branchName} · ${item.name}`,
      reason: [
        item.status !== "active" ? `class ${item.status}` : null,
        item.branchStatus !== "active" ? `branch ${item.branchStatus}` : null,
      ].filter((reason): reason is string => reason !== null).join(", "),
    }));
  const groupOptions: FeeOption[] = groups.map((group) => ({ id: group.id, label: feeDisplayName(group.name) }));
  const typeOptions: FeeOption[] = types.map((type) => ({
    id: type.id,
    label: feeDisplayName(type.name),
  }));
  const structureTypeOptions: FeeOption[] = types.map((type) => ({
    id: type.id,
    label: `${feeDisplayName(type.groupName)} · ${feeDisplayName(type.name)}`,
  }));
  const discountOptions: FeeOption[] = discounts.map((discount) => ({
    id: discount.id,
    label: feeDisplayName(discount.name),
  }));
  const structureOptions: FeeOption[] = structures.map((structure) => ({
    id: structure.id,
    label: `${structure.branchName} · ${structure.className} · ${structure.yearName} · ${feeDisplayName(structure.typeName)}`,
  }));
  const sectionDescriptions: Record<FeesSection, string> = {
    catalog: "Manage the fee groups and fee types used to organize your school’s charges.",
    discounts: "Create scholarships and discounts, then assign them to individual students and fee types.",
    structure: "Set up fee structures for a class or an individual student, then review and manage them here.",
    invoices: "Generate student invoices from an existing fee structure.",
  };
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold text-violet-700">Finance</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{feesSectionLabels[section]}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {sectionDescriptions[section]}
        </p>
      </header>

      {section === "catalog" && (
        <section className="grid gap-4 xl:grid-cols-2">
          <FeeGroupForm />
          <FeeTypeForm groups={groupOptions} />
          <CatalogCard
            title="Fee groups"
            empty="No fee groups yet."
            count={groups.length}
            pagination={groups.length > 0 ? (
              <TablePagination ariaLabel="Fee groups" currentPage={groupPage.page} pageSize={pageSize} totalRows={groups.length} hrefForPage={(page) => paginationHref("groupsPage", page)} />
            ) : undefined}
          >
            {groupPage.rows.map((group) => (
              <li key={group.id} className="flex items-center justify-between gap-2">
                <span>{feeDisplayName(group.name)}</span>
                <div className="flex items-center gap-2">
                  <AdminRecordDialog title={feeDisplayName(group.name)} mode="view"><RecordDetails entries={[["Name", feeDisplayName(group.name)], ["Description", group.description || "None"]]} /></AdminRecordDialog>
                  <AdminRecordDialog title={`Edit ${feeDisplayName(group.name)}`}><FeeGroupForm record={{ ...group, name: feeDisplayName(group.name) }} /></AdminRecordDialog>
                  <DeleteFeeRecordForm recordId={group.id} recordType="group" />
                </div>
              </li>
            ))}
          </CatalogCard>
          <CatalogCard
            title="Fee types"
            empty="No fee types yet."
            count={types.length}
            pagination={types.length > 0 ? (
              <TablePagination ariaLabel="Fee types" currentPage={typePage.page} pageSize={pageSize} totalRows={types.length} hrefForPage={(page) => paginationHref("typesPage", page)} />
            ) : undefined}
          >
            {typePage.rows.map((type) => (
              <li key={type.id} className="flex items-center justify-between gap-2">
                <span>{feeDisplayName(type.name)}</span>
                <div className="flex items-center gap-2">
                  <AdminRecordDialog title={feeDisplayName(type.name)} mode="view"><RecordDetails entries={[["Name", feeDisplayName(type.name)], ["Fee group", feeDisplayName(type.groupName)], ["Description", type.description || "None"]]} /></AdminRecordDialog>
                  <AdminRecordDialog title={`Edit ${feeDisplayName(type.name)}`}><FeeTypeForm groups={groupOptions} record={{ ...type, name: feeDisplayName(type.name) }} /></AdminRecordDialog>
                  <DeleteFeeRecordForm recordId={type.id} recordType="type" />
                </div>
              </li>
            ))}
          </CatalogCard>
        </section>
      )}

      {section === "discounts" && (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            <FeeDiscountForm />
            <StudentFeeDiscountForm
              students={studentsForDiscounts}
              discounts={discountOptions}
              feeTypes={typeOptions}
            />
          </section>
          <CatalogCard
            title="Scholarships and discounts"
            empty="No discounts or scholarships yet."
            count={discounts.length}
            pagination={discounts.length > 0 ? (
              <TablePagination ariaLabel="Scholarships and discounts" currentPage={discountPage.page} pageSize={pageSize} totalRows={discounts.length} hrefForPage={(page) => paginationHref("discountsPage", page)} />
            ) : undefined}
          >
            {discountPage.rows.map((discount) => (
              <li key={discount.id} className="flex items-center justify-between gap-2">
                <span>
                  {feeDisplayName(discount.name)} · {discount.discountType === "percentage" ? `${discount.value}%` : `${school?.currency ?? ""} ${discount.value}`}
                </span>
                <div className="flex items-center gap-2">
                  <AdminRecordDialog title={feeDisplayName(discount.name)} mode="view">
                    <RecordDetails entries={[
                      ["Name", feeDisplayName(discount.name)],
                      ["Code", discount.code],
                      ["Method / value", `${discount.discountType} / ${discount.value}`],
                      ["Frequency", discount.frequency.replace("_", " ")],
                      ["Description", discount.description || "None"],
                    ]} />
                  </AdminRecordDialog>
                  <AdminRecordDialog title={`Edit ${feeDisplayName(discount.name)}`}><FeeDiscountForm record={{ ...discount, name: feeDisplayName(discount.name) }} /></AdminRecordDialog>
                  <DeleteFeeRecordForm recordId={discount.id} recordType="discount" />
                </div>
              </li>
            ))}
          </CatalogCard>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Student assignments</h2>
            {studentDiscountAssignments.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {assignmentPage.rows.map((assignment) => (
                  <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <span>
                      {assignment.studentName} {assignment.studentLastName} · {feeDisplayName(assignment.feeTypeName)} · {feeDisplayName(assignment.discountName)}
                      {assignment.note ? <span className="block text-xs text-slate-500">{assignment.note}</span> : null}
                    </span>
                    <div className="flex items-center gap-2">
                      <AdminRecordDialog title={`${assignment.studentName}'s discount`} mode="view">
                        <RecordDetails entries={[
                          ["Student", `${assignment.studentName} ${assignment.studentLastName}`],
                          ["Fee type", feeDisplayName(assignment.feeTypeName)],
                          ["Discount / scholarship", feeDisplayName(assignment.discountName)],
                          ["Note", assignment.note || "None"],
                        ]} />
                      </AdminRecordDialog>
                      <AdminRecordDialog title={`Edit ${assignment.studentName}'s discount`}>
                        <StudentFeeDiscountForm students={studentsForDiscounts} discounts={discountOptions} feeTypes={typeOptions} record={assignment} />
                      </AdminRecordDialog>
                      <DeleteFeeRecordForm recordId={assignment.id} recordType="student-discount" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-500">No student-specific discounts or scholarships are assigned.</p>}
            {studentDiscountAssignments.length > 0 && (
              <TablePagination ariaLabel="Student discount assignments" currentPage={assignmentPage.page} pageSize={pageSize} totalRows={studentDiscountAssignments.length} hrefForPage={(page) => paginationHref("assignmentsPage", page)} />
            )}
          </section>
        </>
      )}

      {section === "structure" && (
        <>
          {unavailableClasses.length > 0 && (
            <aside role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p>
                Only active classes on active branches can receive fee structures. Excluded:
              </p>
              <ul className="mt-2 list-inside list-disc">
                {unavailableClasses.map((classLevel) => (
                  <li key={classLevel.id}>{classLevel.label} ({classLevel.reason})</li>
                ))}
              </ul>
              <p className="mt-2">Reactivate the class or its branch in Academics if it should be available here.</p>
            </aside>
          )}
          <FeeStructureForm
            branches={branchOptions}
            years={yearOptions}
            terms={termOptions}
            students={studentsForDiscounts}
            classes={classOptions}
            groups={groupOptions}
            types={structureTypeOptions}
          />
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900">Created fee structures</h2>
            <p className="mt-1 text-sm text-slate-500">Saved amounts and due dates by branch, class, and academic year.</p>
          </div>
          {structures.length ? (
            <div className="divide-y divide-slate-100">
              {structurePage.rows.map((structure) => (
                <div key={structure.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{structure.branchName} · {structure.className} · {structure.yearName}{structure.termName ? ` · ${structure.termName}` : ""}{structure.studentName ? ` · ${structure.studentName} ${structure.studentLastName}` : ""}</p>
                    <p className="mt-1 text-slate-500">{feeDisplayName(structure.typeName)} · due {structure.dueDate}</p>
                  </div>
                  <p className="font-semibold text-slate-800">{school?.currency} {structure.amount}</p>
                  <div className="flex items-center gap-2">
                    <AdminRecordDialog title={`${feeDisplayName(structure.typeName)} fee structure`} mode="view">
                      <RecordDetails entries={[
                        ["Branch / class", `${structure.branchName} / ${structure.className}`],
                        ["Academic year / term", `${structure.yearName}${structure.termName ? ` / ${structure.termName}` : ""}`],
                        ["Student", structure.studentName ? `${structure.studentName} ${structure.studentLastName}` : "Whole class"],
                        ["Fee type", feeDisplayName(structure.typeName)],
                        ["Fee group", feeDisplayName(structure.groupName)],
                        ["Amount", `${school?.currency ?? ""} ${structure.amount}`],
                        ["Due date", structure.dueDate],
                        ["Late fine", `${structure.fineType} · ${structure.fineValue}`],
                      ]} />
                    </AdminRecordDialog>
                    <AdminRecordDialog title={`Edit ${feeDisplayName(structure.typeName)} fee structure`} wide>
                      <FeeStructureForm branches={branchOptions} years={yearOptions} terms={termOptions} students={studentsForDiscounts} classes={classOptions} groups={groupOptions} types={structureTypeOptions} record={structure} />
                    </AdminRecordDialog>
                    <DeleteFeeRecordForm recordId={structure.id} recordType="structure" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-slate-500">No fee structures have been created yet.</p>
          )}
          {structures.length > 0 && (
            <TablePagination ariaLabel="Created fee structures" currentPage={structurePage.page} pageSize={pageSize} totalRows={structures.length} hrefForPage={(page) => paginationHref("structuresPage", page)} />
          )}
          </section>
        </>
      )}

      {section === "invoices" && (
        <GenerateInvoicesForm structures={structureOptions} students={studentsForDiscounts} />
      )}
    </div>
  );
}

function RecordDetails({ entries }: { entries: [string, string][] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {entries.map(([label, value]) => (
        <div key={label} className="border-b border-slate-100 pb-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 text-sm text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CatalogCard({
  title,
  empty,
  count,
  pagination,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  pagination?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        {count > 0 ? children : <li>{empty}</li>}
      </ul>
      {pagination}
    </div>
  );
}
