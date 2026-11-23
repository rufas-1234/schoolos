import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { db } from "@/db";
import {
  academicTerms,
  academicYears,
  classLevels,
  feeGroups,
  feeStructures,
  feeTypes,
  schoolBranches,
  schools,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { feeDisplayName } from "@/lib/fees-policy";
import { getSchoolAcademicYearSelection } from "@/lib/academic-year-selection";
import { resolveBranchFilterId } from "@/lib/branch-selection-policy";

type SearchParams = {
  sort?: string | string[];
  branchId?: string | string[];
  yearId?: string | string[];
  termId?: string | string[];
  classLevelId?: string | string[];
};

function parseId(value: string | string[] | undefined): number | null {
  return typeof value === "string" && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}

type StructurePrintRow = {
  id: number;
  branchId: number;
  branchName: string;
  classLevelId: number;
  className: string;
  academicYearId: number;
  yearName: string;
  termId: number | null;
  termName: string | null;
  studentId: number | null;
  studentName: string | null;
  studentLastName: string | null;
  admissionNumber: string | null;
  groupName: string;
  typeName: string;
  amount: string;
  currency: string;
  dueDate: string;
  fineType: string;
  fineValue: string;
};

type StructureGroup = {
  key: string;
  title: string;
  subtitle: string;
  rows: StructurePrintRow[];
};

export default async function FeeStructurePrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [context, params] = await Promise.all([
    requireSchoolPermission("fees.manage"),
    searchParams,
  ]);
  const academicYearSelection = await getSchoolAcademicYearSelection(context.schoolId);
  const sortBy = typeof params.sort === "string" && ["class", "student"].includes(params.sort)
    ? params.sort
    : "class";
  const requestedBranchValue = typeof params.branchId === "string" ? params.branchId : undefined;
  const requestedYearValue = typeof params.yearId === "string" ? params.yearId : undefined;
  const termId = parseId(params.termId);
  const classLevelId = parseId(params.classLevelId);
  if ((params.sort !== undefined && typeof params.sort !== "string") ||
      (params.branchId !== undefined && params.branchId !== "" && parseId(params.branchId) === null) ||
      (params.yearId !== undefined && params.yearId !== "" && parseId(params.yearId) === null) ||
      (params.termId !== undefined && params.termId !== "" && termId === null) ||
      (params.classLevelId !== undefined && params.classLevelId !== "" && classLevelId === null)) notFound();

  const [school, branches, terms, classes] = await Promise.all([
    db.select({ name: schools.name, address: schools.address, email: schools.email, phone: schools.phone })
      .from(schools).where(eq(schools.id, context.schoolId)).limit(1).then((rows) => rows[0]),
    db.select({ id: schoolBranches.id, name: schoolBranches.name }).from(schoolBranches)
      .where(eq(schoolBranches.schoolId, context.schoolId)).orderBy(asc(schoolBranches.name)),
    db.select({ id: academicTerms.id, name: academicTerms.name, academicYearId: academicTerms.academicYearId })
      .from(academicTerms).where(eq(academicTerms.schoolId, context.schoolId)).orderBy(asc(academicTerms.startDate)),
    db.select({ id: classLevels.id, name: classLevels.name, branchId: classLevels.branchId })
      .from(classLevels).where(eq(classLevels.schoolId, context.schoolId)).orderBy(asc(classLevels.name)),
  ]);
  const years = academicYearSelection.years;
  const branchId = resolveBranchFilterId(branches, requestedBranchValue);
  const yearId = params.yearId === undefined
    ? academicYearSelection.selectedYear?.id ?? null
    : requestedYearValue === ""
      ? null
      : parseId(params.yearId);
  if (!school) notFound();
  if ((branchId !== null && !branches.some((item) => item.id === branchId)) ||
      (yearId !== null && !years.some((item) => item.id === yearId)) ||
      (termId !== null && !terms.some((item) => item.id === termId)) ||
      (classLevelId !== null && !classes.some((item) => item.id === classLevelId))) notFound();

  const rows = await db.select({
    id: feeStructures.id,
    branchId: schoolBranches.id,
    branchName: schoolBranches.name,
    classLevelId: classLevels.id,
    className: classLevels.name,
    academicYearId: academicYears.id,
    yearName: academicYears.name,
    termId: academicTerms.id,
    termName: academicTerms.name,
    studentId: students.id,
    studentName: students.firstName,
    studentLastName: students.lastName,
    admissionNumber: students.admissionNumber,
    groupName: feeGroups.name,
    typeName: feeTypes.name,
    amount: feeStructures.amount,
    currency: feeStructures.currency,
    dueDate: feeStructures.dueDate,
    fineType: feeStructures.fineType,
    fineValue: feeStructures.fineValue,
  }).from(feeStructures)
    .innerJoin(schoolBranches, and(
      eq(schoolBranches.id, feeStructures.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
    ))
    .innerJoin(classLevels, and(
      eq(classLevels.id, feeStructures.classLevelId),
      eq(classLevels.schoolId, context.schoolId),
    ))
    .innerJoin(academicYears, and(
      eq(academicYears.id, feeStructures.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    ))
    .leftJoin(academicTerms, and(
      eq(academicTerms.id, feeStructures.academicTermId),
      eq(academicTerms.schoolId, context.schoolId),
    ))
    .leftJoin(students, and(
      eq(students.id, feeStructures.studentId),
      eq(students.schoolId, context.schoolId),
    ))
    .innerJoin(feeGroups, and(
      eq(feeGroups.id, feeStructures.feeGroupId),
      eq(feeGroups.schoolId, context.schoolId),
    ))
    .innerJoin(feeTypes, and(
      eq(feeTypes.id, feeStructures.feeTypeId),
      eq(feeTypes.schoolId, context.schoolId),
    ))
    .where(and(
      eq(feeStructures.schoolId, context.schoolId),
      ...(branchId !== null ? [eq(feeStructures.branchId, branchId)] : []),
      ...(yearId !== null ? [eq(feeStructures.academicYearId, yearId)] : []),
      ...(termId !== null ? [eq(feeStructures.academicTermId, termId)] : []),
      ...(classLevelId !== null ? [eq(feeStructures.classLevelId, classLevelId)] : []),
    ))
    .orderBy(
      ...(sortBy === "student"
        ? [asc(students.lastName), asc(students.firstName), asc(schoolBranches.name), asc(classLevels.name), asc(academicYears.name)]
        : [asc(schoolBranches.name), asc(classLevels.name), asc(academicYears.name), asc(academicTerms.name), asc(students.lastName), asc(students.firstName)]),
      asc(feeGroups.name),
      asc(feeTypes.name),
    )
    .limit(2001) as StructurePrintRow[];
  const tooMany = rows.length > 2000;
  const printableRows = tooMany ? [] : rows;

  const groups = new Map<string, StructureGroup>();
  for (const row of printableRows) {
    const termLabel = row.termName ?? "Full year";
    const groupKey = sortBy === "class"
      ? `class:${row.branchId}:${row.classLevelId}:${row.academicYearId}:${row.termId ?? "full"}`
      : row.studentId
        ? `student:${row.studentId}:${row.classLevelId}:${row.academicYearId}:${row.termId ?? "full"}`
        : `class:${row.branchId}:${row.classLevelId}:${row.academicYearId}:${row.termId ?? "full"}`;
    let group = groups.get(groupKey);
    if (!group) {
      const studentSpecific = sortBy === "student" && row.studentId !== null;
      group = {
        key: groupKey,
        title: studentSpecific
          ? `${row.studentName} ${row.studentLastName}${row.admissionNumber ? ` · ${row.admissionNumber}` : ""}`
          : sortBy === "student"
            ? `Class-wide fees · ${row.className}`
            : `${row.branchName} · ${row.className}`,
        subtitle: `${row.branchName} · ${row.className} · ${row.yearName} · ${termLabel}${sortBy === "student" && !studentSpecific ? " · Applies to all students in the class" : ""}`,
        rows: [],
      };
      groups.set(groupKey, group);
    }
    group.rows.push(row);
  }

  return (
    <main className="fee-structure-print-page mx-auto max-w-6xl space-y-6 p-5 text-slate-900 print:max-w-none print:p-0">
      <header className="fee-structure-print-controls flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 print:hidden sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Finance · School fee schedule</p>
          <h1 className="mt-1 text-2xl font-bold">Printable fee structures</h1>
          <p className="mt-2 text-sm text-slate-600">Review the school’s configured fees by class or by individual student.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/fees?section=structure" className="text-sm font-semibold text-violet-700">Back to fee setup</Link>
          <PrintButton label="Print fee structures" disabled={tooMany || printableRows.length === 0} pageOrientation="landscape" pageMargin="12mm" />
        </div>
      </header>

      <SmartFilterForm method="get" action="/admin/fees/structures/print" className="fee-structure-filter grid gap-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm font-medium">Sort by
          <select name="sort" defaultValue={sortBy} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
            <option value="class">Class</option>
            <option value="student">Student</option>
          </select>
        </label>
        <label className="text-sm font-medium">Branch
          <select name="branchId" defaultValue={branchId?.toString() ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
            <option value="">All branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Academic year
          <select name="yearId" defaultValue={yearId?.toString() ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
            <option value="">All years</option>
            {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Term
          <select name="termId" defaultValue={termId?.toString() ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
            <option value="">All terms</option>
            {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Class
          <select name="classLevelId" defaultValue={classLevelId?.toString() ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
            <option value="">All classes</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </SmartFilterForm>

      {tooMany ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 print:hidden">More than 2,000 fee lines match these filters. Narrow the report before printing.</p>
      ) : printableRows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 print:hidden">No fee structures match these filters.</p>
      ) : (
        <section className="fee-structure-print-document space-y-5 rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
          <header className="fee-structure-school-heading border-b-2 border-violet-800 pb-4 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Official school fee schedule</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{school.name}</h2>
            <p className="mt-1 text-sm text-slate-600">{[school.address, school.email, school.phone].filter(Boolean).join(" · ")}</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">Fee structures · Sorted by {sortBy}</p>
          </header>
          <p className="text-xs text-slate-500">Class-wide amounts apply to each student in that class. Individual amounts apply only to the named student. This report lists configured charges and does not include payments.</p>
          {[...groups.values()].map((group) => (
            <section key={group.key} className="fee-structure-print-group overflow-hidden rounded-xl border border-slate-200">
              <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="font-semibold text-slate-900">{group.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{group.subtitle}</p>
              </header>
              <div className="overflow-x-auto">
                <table className="fee-structure-print-table w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead><tr><th>Fee group</th><th>Fee item</th><th>Applies to</th><th className="text-right">Amount</th><th>Due date</th><th>Late fine</th></tr></thead>
                  <tbody>{group.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{feeDisplayName(row.groupName)}</td>
                      <td className="font-medium">{feeDisplayName(row.typeName)}</td>
                      <td>{row.studentId ? `${row.studentName} ${row.studentLastName}${row.admissionNumber ? ` · ${row.admissionNumber}` : ""}` : "All students in class"}</td>
                      <td className="text-right font-semibold">{row.currency} {row.amount}</td>
                      <td>{row.dueDate}</td>
                      <td className="capitalize">{row.fineType === "none" ? "None" : `${row.fineType} · ${row.fineValue}${row.fineType === "percentage" ? "%" : ` ${row.currency}`}`}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          ))}
        </section>
      )}
    </main>
  );
}
