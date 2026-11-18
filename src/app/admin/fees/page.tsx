import { and, asc, eq, inArray } from "drizzle-orm";
import type { ReactNode } from "react";
import { db } from "@/db";
import { AdminRecordDialog } from "@/components/admin-data-table";
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

export default async function FeesSetupPage() {
  const context = await requireSchoolPermission("fees.manage");
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
      })
        .from(classLevels)
        .innerJoin(schoolBranches, eq(classLevels.branchId, schoolBranches.id))
        .where(and(
          eq(classLevels.schoolId, context.schoolId),
          eq(classLevels.status, "active"),
          eq(schoolBranches.schoolId, context.schoolId),
          eq(schoolBranches.status, "active"),
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
  const classOptions: FeeOption[] = classes.map((item) => ({
    id: item.id,
    label: `${item.branchName} · ${item.name}`,
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
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold text-violet-700">Finance</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Fees setup</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Define fee groups and types, create class-level fee schedules, apply student discounts, then generate invoices for enrolled students.
        </p>
      </header>

      <section className="grid gap-4 xl:grid-cols-3">
        <FeeGroupForm />
        <FeeTypeForm groups={groupOptions} />
        <FeeDiscountForm />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <StudentFeeDiscountForm
          students={studentsForDiscounts}
          discounts={discountOptions}
          feeTypes={typeOptions}
        />
        <FeeStructureForm
          branches={branchOptions}
          years={yearOptions}
          terms={termOptions}
          students={studentsForDiscounts}
          classes={classOptions}
          groups={groupOptions}
          types={structureTypeOptions}
        />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Student discounts and scholarships</h2>
        {studentDiscountAssignments.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {studentDiscountAssignments.map((assignment) => (
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
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900">Fee structures</h2>
            <p className="mt-1 text-sm text-slate-500">Saved amounts and due dates by branch, class, and academic year.</p>
          </div>
          {structures.length ? (
            <div className="divide-y divide-slate-100">
              {structures.map((structure) => (
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
        </div>
        <GenerateInvoicesForm structures={structureOptions} students={studentsForDiscounts} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <CatalogCard title="Fee groups" empty="No fee groups yet." count={groups.length}>
          {groups.map((group) => (
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
        <CatalogCard title="Fee types" empty="No fee types yet." count={types.length}>
          {types.map((type) => (
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
        <CatalogCard title="Discounts" empty="No discounts yet." count={discounts.length}>
          {discounts.map((discount) => (
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
      </section>
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
  children,
}: {
  title: string;
  empty: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        {count > 0 ? children : <li>{empty}</li>}
      </ul>
    </div>
  );
}
