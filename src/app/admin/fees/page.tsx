import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  academicYears,
  classLevels,
  feeDiscounts,
  feeGroups,
  feeStructures,
  feeTypes,
  schools,
  schoolBranches,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  FeeDiscountForm,
  FeeGroupForm,
  FeeStructureForm,
  FeeTypeForm,
  GenerateInvoicesForm,
  StudentFeeDiscountForm,
  type FeeOption,
} from "./fee-forms";

export default async function FeesSetupPage() {
  const context = await requireSchoolPermission("fees.manage");
  const [school, branches, years, classes, groups, types, discounts, eligibleStudents, structures] =
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
        id: classLevels.id,
        name: classLevels.name,
        branchName: schoolBranches.name,
      })
        .from(classLevels)
        .innerJoin(schoolBranches, eq(classLevels.branchId, schoolBranches.id))
        .where(and(
          eq(classLevels.schoolId, context.schoolId),
          eq(schoolBranches.schoolId, context.schoolId),
          eq(schoolBranches.status, "active"),
        ))
        .orderBy(asc(schoolBranches.name), asc(classLevels.name)),
      db.select({ id: feeGroups.id, name: feeGroups.name })
        .from(feeGroups)
        .where(eq(feeGroups.schoolId, context.schoolId))
        .orderBy(asc(feeGroups.name)),
      db.select({
        id: feeTypes.id,
        name: feeTypes.name,
        groupName: feeGroups.name,
      })
        .from(feeTypes)
        .innerJoin(feeGroups, eq(feeTypes.feeGroupId, feeGroups.id))
        .where(eq(feeTypes.schoolId, context.schoolId))
        .orderBy(asc(feeGroups.name), asc(feeTypes.name)),
      db.select({
        id: feeDiscounts.id,
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
        className: classLevels.name,
        yearName: academicYears.name,
        groupName: feeGroups.name,
        typeName: feeTypes.name,
        amount: feeStructures.amount,
        dueDate: feeStructures.dueDate,
        branchName: schoolBranches.name,
      })
        .from(feeStructures)
        .innerJoin(classLevels, eq(feeStructures.classLevelId, classLevels.id))
        .innerJoin(academicYears, eq(feeStructures.academicYearId, academicYears.id))
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
  const classOptions: FeeOption[] = classes.map((item) => ({
    id: item.id,
    label: `${item.branchName} — ${item.name}`,
  }));
  const groupOptions: FeeOption[] = groups.map((group) => ({ id: group.id, label: group.name }));
  const typeOptions: FeeOption[] = types.map((type) => ({
    id: type.id,
    label: `${type.groupName} — ${type.name}`,
  }));
  const discountOptions: FeeOption[] = discounts.map((discount) => ({
    id: discount.id,
    label: `${discount.name} (${discount.code})`,
  }));
  const structureOptions: FeeOption[] = structures.map((structure) => ({
    id: structure.id,
    label: `${structure.branchName} · ${structure.className} · ${structure.yearName} · ${structure.typeName}`,
  }));
  const catalogCards: { title: string; entries: string[] }[] = [
    { title: "Groups", entries: groups.map((group) => group.name) },
    { title: "Fee types", entries: types.map((type) => `${type.groupName} / ${type.name}`) },
    {
      title: "Discounts",
      entries: discounts.map((discount) =>
        `${discount.name} · ${discount.discountType === "percentage" ? `${discount.value}%` : `${school?.currency ?? ""} ${discount.value}`} · ${discount.frequency.replace("_", " ")}`,
      ),
    },
  ];

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
          classes={classOptions}
          groups={groupOptions}
          types={typeOptions}
        />
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
                    <p className="font-medium text-slate-900">{structure.branchName} · {structure.className} · {structure.yearName}</p>
                    <p className="mt-1 text-slate-500">{structure.groupName} / {structure.typeName} · due {structure.dueDate}</p>
                  </div>
                  <p className="font-semibold text-slate-800">{school?.currency} {structure.amount}</p>
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
        {catalogCards.map(({ title, entries }) => (
          <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">{title}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {entries.length ? entries.map((entry) => <li key={entry}>{entry}</li>) : <li>None created yet.</li>}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
