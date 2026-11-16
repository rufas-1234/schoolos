import { and, asc, count, desc, eq, gte, inArray, lt, lte, or, sql, sum } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/db";
import { PrintButton } from "@/components/print-button";
import { FeeReportFilters } from "./fee-report-filters";
import { TablePagination } from "@/components/table-pagination";
import { parsePageSize } from "@/components/pagination-utils";
import type { SearchableSelectOption } from "@/components/searchable-select";
import {
  academicYears,
  classLevels,
  classSections,
  feePayments,
  feePaymentReversals,
  feeStructures,
  feeTypes,
  schools,
  schoolBranches,
  studentEnrollments,
  studentFeeInvoices,
  students,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  calculateFineMinorUnits,
  feeDisplayName,
  formatFeeReportDate,
  feePaymentDateRangeInTimezone,
  feeInvoiceStatus,
  parseMoneyToMinorUnits,
  resolveFeeReportDateRange,
} from "@/lib/fees-policy";

type SearchParams = {
  from?: string | string[];
  to?: string | string[];
  branchId?: string | string[];
  classLevelId?: string | string[];
  sectionId?: string | string[];
  feeTypeId?: string | string[];
  status?: string | string[];
  paymentsPage?: string | string[];
  reversalsPage?: string | string[];
  invoicesPage?: string | string[];
  feeTypesPage?: string | string[];
  pageSize?: string | string[];
};

function requestedPage(value: string | string[] | undefined): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function money(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function FeeReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSchoolPermission(["payments.record", "fees.manage"]);
  const params = await searchParams;
  const pageSize = parsePageSize(params.pageSize);
  const paymentPage = requestedPage(params.paymentsPage);
  const reversalPage = requestedPage(params.reversalsPage);
  const invoicePage = requestedPage(params.invoicesPage);
  const feeTypePage = requestedPage(params.feeTypesPage);
  const [school, branches, classes, sections, feeTypesList] = await Promise.all([
    db.select({ currency: schools.currency, timezone: schools.timezone })
      .from(schools).where(eq(schools.id, context.schoolId)).then((rows) => rows[0]),
    db.select({ id: schoolBranches.id, name: schoolBranches.name })
      .from(schoolBranches).where(eq(schoolBranches.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name)),
    db.select({ id: classLevels.id, name: classLevels.name, branchName: schoolBranches.name })
      .from(classLevels)
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .where(eq(classLevels.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name), asc(classLevels.name)),
    db.select({
      id: classSections.id,
      name: classSections.name,
      className: classLevels.name,
      branchName: schoolBranches.name,
      yearName: academicYears.name,
    })
      .from(classSections)
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .innerJoin(academicYears, and(
        eq(academicYears.id, classSections.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .where(eq(classSections.schoolId, context.schoolId))
      .orderBy(asc(schoolBranches.name), asc(classLevels.name), asc(classSections.name)),
    db.select({ id: feeTypes.id, name: feeTypes.name })
      .from(feeTypes)
      .where(eq(feeTypes.schoolId, context.schoolId))
      .orderBy(asc(feeTypes.name)),
  ]);
  const today = todayInTimezone(school?.timezone ?? "UTC");
  const { from, to } = resolveFeeReportDateRange(
    typeof params.from === "string" ? params.from : undefined,
    typeof params.to === "string" ? params.to : undefined,
    today,
  );
  const requestedBranch = typeof params.branchId === "string" && /^\d+$/.test(params.branchId)
    ? Number(params.branchId)
    : null;
  const requestedClass = typeof params.classLevelId === "string" && /^\d+$/.test(params.classLevelId)
    ? Number(params.classLevelId)
    : null;
  const requestedSection = typeof params.sectionId === "string" && /^\d+$/.test(params.sectionId)
    ? Number(params.sectionId)
    : null;
  const requestedFeeTypeId = typeof params.feeTypeId === "string" && /^\d+$/.test(params.feeTypeId)
    ? Number(params.feeTypeId)
    : null;
  const requestedStatus = typeof params.status === "string" &&
    ["unpaid", "partial", "paid"].includes(params.status)
    ? params.status
    : "";
  const branchOptions: SearchableSelectOption[] = [
    { value: "", label: "All branches" },
    ...branches.map((branch) => ({ value: String(branch.id), label: branch.name })),
  ];
  const classOptions: SearchableSelectOption[] = [
    { value: "", label: "All classes" },
    ...classes.map((item) => ({ value: String(item.id), label: item.name })),
  ];
  const sectionOptions: SearchableSelectOption[] = [
    { value: "", label: "All sections" },
    ...sections.map((section) => ({
      value: String(section.id),
      label: `${section.className} / ${section.name} (${section.yearName})`,
    })),
  ];
  const feeTypeOptions: SearchableSelectOption[] = [
    { value: "", label: "All fee types" },
    ...feeTypesList.map((feeType) => ({ value: String(feeType.id), label: feeDisplayName(feeType.name) })),
  ];
  const statusOptions: SearchableSelectOption[] = [
    { value: "", label: "All statuses" },
    { value: "paid", label: "Fully paid" },
    { value: "partial", label: "Partially paid" },
    { value: "unpaid", label: "Unpaid" },
  ];
  const dateRange = feePaymentDateRangeInTimezone(from, to, school?.timezone ?? "UTC");
  if (!dateRange) throw new Error("The requested fee report date range is invalid.");
  const [payments, dueInvoices, paymentTotals, reversals, reversalTotals] = await Promise.all([
    db.select({
      publicId: feePayments.publicId,
      amount: feePayments.amount,
      reversedAmount: feePayments.reversedAmount,
      fineAmount: feePayments.fineAmount,
      receiptNumber: feePayments.receiptNumber,
      paymentMethod: feePayments.paymentMethod,
      reference: feePayments.reference,
      paidAt: feePayments.paidAt,
      studentName: students.firstName,
      studentLastName: students.lastName,
      admissionNumber: students.admissionNumber,
      rollNumber: studentEnrollments.rollNumber,
      branchName: schoolBranches.name,
      className: classLevels.name,
      sectionName: classSections.name,
      yearName: academicYears.name,
      feeTypeName: feeTypes.name,
    })
      .from(feePayments)
      .innerJoin(studentFeeInvoices, and(
        eq(studentFeeInvoices.id, feePayments.invoiceId),
        eq(studentFeeInvoices.schoolId, context.schoolId),
      ))
      .innerJoin(students, and(
        eq(students.id, studentFeeInvoices.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .innerJoin(studentEnrollments, and(
        eq(studentEnrollments.id, studentFeeInvoices.enrollmentId),
        eq(studentEnrollments.schoolId, context.schoolId),
      ))
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .innerJoin(feeStructures, and(
        eq(feeStructures.id, studentFeeInvoices.feeStructureId),
        eq(feeStructures.schoolId, context.schoolId),
      ))
      .innerJoin(academicYears, and(
        eq(academicYears.id, feeStructures.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
      ))
      .innerJoin(feeTypes, and(
        eq(feeTypes.id, feeStructures.feeTypeId),
        eq(feeTypes.schoolId, context.schoolId),
      ))
      .where(and(
        eq(feePayments.schoolId, context.schoolId),
        gte(feePayments.paidAt, dateRange.start),
        lt(feePayments.paidAt, dateRange.endExclusive),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
        ...(requestedFeeTypeId ? [eq(feeTypes.id, requestedFeeTypeId)] : []),
      ))
      .orderBy(desc(feePayments.paidAt))
      .limit(pageSize)
      .offset((paymentPage - 1) * pageSize),
    db.select({
      id: studentFeeInvoices.id,
      feeTypeId: feeTypes.id,
      amount: studentFeeInvoices.amount,
      discountAmount: studentFeeInvoices.discountAmount,
      fineType: studentFeeInvoices.fineType,
      fineValue: studentFeeInvoices.fineValue,
      dueDate: studentFeeInvoices.dueDate,
      studentName: students.firstName,
      studentLastName: students.lastName,
      admissionNumber: students.admissionNumber,
      rollNumber: studentEnrollments.rollNumber,
      branchName: schoolBranches.name,
      className: classLevels.name,
      sectionName: classSections.name,
      feeTypeName: feeTypes.name,
    })
      .from(studentFeeInvoices)
      .innerJoin(students, and(
        eq(students.id, studentFeeInvoices.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .innerJoin(studentEnrollments, and(
        eq(studentEnrollments.id, studentFeeInvoices.enrollmentId),
        eq(studentEnrollments.schoolId, context.schoolId),
      ))
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .innerJoin(feeStructures, and(
        eq(feeStructures.id, studentFeeInvoices.feeStructureId),
        eq(feeStructures.schoolId, context.schoolId),
      ))
      .innerJoin(feeTypes, and(
        eq(feeTypes.id, feeStructures.feeTypeId),
        eq(feeTypes.schoolId, context.schoolId),
      ))
      .where(and(
        eq(studentFeeInvoices.schoolId, context.schoolId),
        or(
          and(
            gte(studentFeeInvoices.dueDate, from),
            lte(studentFeeInvoices.dueDate, to),
          ),
          and(
            gte(studentFeeInvoices.createdAt, dateRange.start),
            lt(studentFeeInvoices.createdAt, dateRange.endExclusive),
          ),
        ),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
        ...(requestedFeeTypeId ? [eq(feeTypes.id, requestedFeeTypeId)] : []),
      ))
      .orderBy(asc(studentFeeInvoices.dueDate)),
    db.select({
      amount: sum(feePayments.amount),
      fineAmount: sum(feePayments.fineAmount),
      count: count(feePayments.id),
    })
      .from(feePayments)
      .innerJoin(studentFeeInvoices, and(
        eq(studentFeeInvoices.id, feePayments.invoiceId),
        eq(studentFeeInvoices.schoolId, context.schoolId),
      ))
      .innerJoin(studentEnrollments, and(
        eq(studentEnrollments.id, studentFeeInvoices.enrollmentId),
        eq(studentEnrollments.schoolId, context.schoolId),
      ))
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .innerJoin(feeStructures, and(
        eq(feeStructures.id, studentFeeInvoices.feeStructureId),
        eq(feeStructures.schoolId, context.schoolId),
      ))
      .innerJoin(feeTypes, and(
        eq(feeTypes.id, feeStructures.feeTypeId),
        eq(feeTypes.schoolId, context.schoolId),
      ))
      .where(and(
        eq(feePayments.schoolId, context.schoolId),
        gte(feePayments.paidAt, dateRange.start),
        lt(feePayments.paidAt, dateRange.endExclusive),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
        ...(requestedFeeTypeId ? [eq(feeTypes.id, requestedFeeTypeId)] : []),
      ))
      .then((rows) => rows[0]),
    db.select({
      publicId: feePaymentReversals.publicId,
      amount: feePaymentReversals.amount,
      fineAmount: feePaymentReversals.fineAmount,
      reversalType: feePaymentReversals.reversalType,
      reason: feePaymentReversals.reason,
      reference: feePaymentReversals.reference,
      createdAt: feePaymentReversals.createdAt,
      receiptNumber: feePayments.receiptNumber,
      paymentPublicId: feePayments.publicId,
      studentName: students.firstName,
      studentLastName: students.lastName,
      branchName: schoolBranches.name,
      className: classLevels.name,
      sectionName: classSections.name,
    })
      .from(feePaymentReversals)
      .innerJoin(feePayments, and(
        eq(feePayments.id, feePaymentReversals.paymentId),
        eq(feePayments.schoolId, context.schoolId),
      ))
      .innerJoin(studentFeeInvoices, and(
        eq(studentFeeInvoices.id, feePayments.invoiceId),
        eq(studentFeeInvoices.schoolId, context.schoolId),
      ))
      .innerJoin(students, and(
        eq(students.id, studentFeeInvoices.studentId),
        eq(students.schoolId, context.schoolId),
      ))
      .innerJoin(studentEnrollments, and(
        eq(studentEnrollments.id, studentFeeInvoices.enrollmentId),
        eq(studentEnrollments.schoolId, context.schoolId),
      ))
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .innerJoin(feeStructures, and(
        eq(feeStructures.id, studentFeeInvoices.feeStructureId),
        eq(feeStructures.schoolId, context.schoolId),
      ))
      .innerJoin(feeTypes, and(
        eq(feeTypes.id, feeStructures.feeTypeId),
        eq(feeTypes.schoolId, context.schoolId),
      ))
      .where(and(
        eq(feePaymentReversals.schoolId, context.schoolId),
        gte(feePaymentReversals.createdAt, dateRange.start),
        lt(feePaymentReversals.createdAt, dateRange.endExclusive),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
        ...(requestedFeeTypeId ? [eq(feeTypes.id, requestedFeeTypeId)] : []),
      ))
      .orderBy(desc(feePaymentReversals.createdAt))
      .limit(pageSize)
      .offset((reversalPage - 1) * pageSize),
    db.select({
      amount: sum(feePaymentReversals.amount),
      fineAmount: sum(feePaymentReversals.fineAmount),
      count: count(feePaymentReversals.id),
    })
      .from(feePaymentReversals)
      .innerJoin(feePayments, and(
        eq(feePayments.id, feePaymentReversals.paymentId),
        eq(feePayments.schoolId, context.schoolId),
      ))
      .innerJoin(studentFeeInvoices, and(
        eq(studentFeeInvoices.id, feePayments.invoiceId),
        eq(studentFeeInvoices.schoolId, context.schoolId),
      ))
      .innerJoin(studentEnrollments, and(
        eq(studentEnrollments.id, studentFeeInvoices.enrollmentId),
        eq(studentEnrollments.schoolId, context.schoolId),
      ))
      .innerJoin(classSections, and(
        eq(classSections.id, studentEnrollments.classSectionId),
        eq(classSections.schoolId, context.schoolId),
      ))
      .innerJoin(classLevels, and(
        eq(classLevels.id, classSections.classLevelId),
        eq(classLevels.schoolId, context.schoolId),
      ))
      .innerJoin(schoolBranches, and(
        eq(schoolBranches.id, classLevels.branchId),
        eq(schoolBranches.schoolId, context.schoolId),
      ))
      .innerJoin(feeStructures, and(
        eq(feeStructures.id, studentFeeInvoices.feeStructureId),
        eq(feeStructures.schoolId, context.schoolId),
      ))
      .innerJoin(feeTypes, and(
        eq(feeTypes.id, feeStructures.feeTypeId),
        eq(feeTypes.schoolId, context.schoolId),
      ))
      .where(and(
        eq(feePaymentReversals.schoolId, context.schoolId),
        gte(feePaymentReversals.createdAt, dateRange.start),
        lt(feePaymentReversals.createdAt, dateRange.endExclusive),
        ...(requestedBranch ? [eq(schoolBranches.id, requestedBranch)] : []),
        ...(requestedClass ? [eq(classLevels.id, requestedClass)] : []),
        ...(requestedSection ? [eq(classSections.id, requestedSection)] : []),
        ...(requestedFeeTypeId ? [eq(feeTypes.id, requestedFeeTypeId)] : []),
      ))
      .then((rows) => rows[0]),
  ]);
  const invoiceIds = dueInvoices.map((invoice) => invoice.id);
  const invoicePayments = [];
  for (let offset = 0; offset < invoiceIds.length; offset += 500) {
    const batch = invoiceIds.slice(offset, offset + 500);
    const batchPayments = await db.select({
      invoiceId: feePayments.invoiceId,
      amount: sum(sql`${feePayments.amount} - ${feePayments.reversedAmount}`),
      fineAmount: sum(sql`greatest(0, ${feePayments.fineAmount} - least(${feePayments.reversedAmount}, ${feePayments.fineAmount}))`),
    })
      .from(feePayments)
      .where(and(eq(feePayments.schoolId, context.schoolId), inArray(feePayments.invoiceId, batch)))
      .groupBy(feePayments.invoiceId)
    invoicePayments.push(...batchPayments);
  }
  const paidByInvoice = new Map(invoicePayments.map((item) => [
    item.invoiceId,
    {
      paid: parseMoneyToMinorUnits(item.amount ?? "0") ?? 0,
      fine: parseMoneyToMinorUnits(item.fineAmount ?? "0") ?? 0,
    },
  ]));
  const invoicesWithStatus = dueInvoices.map((invoice) => {
    const amount = parseMoneyToMinorUnits(invoice.amount) ?? 0;
    const discount = parseMoneyToMinorUnits(invoice.discountAmount) ?? 0;
    const dueFine = today > invoice.dueDate
      ? calculateFineMinorUnits(amount - discount, invoice.fineType, invoice.fineValue) ?? 0
      : 0;
    const payment = paidByInvoice.get(invoice.id) ?? { paid: 0, fine: 0 };
    const totalDue = amount - discount + dueFine;
    const balance = Math.max(0, totalDue - payment.paid);
    return {
      ...invoice,
      amountDue: totalDue,
      paid: payment.paid,
      balance,
      status: feeInvoiceStatus(totalDue, payment.paid) ?? "unpaid",
    };
  });
  const filteredInvoices = invoicesWithStatus.filter((invoice) =>
    !requestedStatus || invoice.status === requestedStatus
  );
  const outstandingInvoices = invoicesWithStatus.filter((invoice) => invoice.balance > 0);
  const feeTypeRows = new Map(
    feeTypesList
      .filter((feeType) => requestedFeeTypeId === null || feeType.id === requestedFeeTypeId)
      .map((feeType): [number, { name: string; count: number; due: number; paid: number; balance: number }] => [
        feeType.id,
        { name: feeType.name, count: 0, due: 0, paid: 0, balance: 0 },
      ]),
  );
  filteredInvoices.reduce((groups, invoice) => {
    const row = groups.get(invoice.feeTypeId) ?? {
      name: invoice.feeTypeName,
      count: 0,
      due: 0,
      paid: 0,
      balance: 0,
    };
    row.count += 1;
    row.due += invoice.amountDue;
    row.paid += invoice.paid;
    row.balance += invoice.balance;
    groups.set(invoice.feeTypeId, row);
    return groups;
  }, feeTypeRows);
  const feeTypeSummary = [...feeTypeRows.entries()].sort(([, first], [, second]) =>
    first.name.localeCompare(second.name)
  );
  const visibleInvoices = filteredInvoices.slice((invoicePage - 1) * pageSize, invoicePage * pageSize);
  const visibleFeeTypeSummary = feeTypeSummary.slice((feeTypePage - 1) * pageSize, feeTypePage * pageSize);
  const reportPageHref = (parameter: string, page: number) => {
    const query = new URLSearchParams({
      from,
      to,
      ...(requestedBranch ? { branchId: String(requestedBranch) } : {}),
      ...(requestedClass ? { classLevelId: String(requestedClass) } : {}),
      ...(requestedSection ? { sectionId: String(requestedSection) } : {}),
      ...(requestedFeeTypeId ? { feeTypeId: String(requestedFeeTypeId) } : {}),
      ...(requestedStatus ? { status: requestedStatus } : {}),
      pageSize: String(pageSize),
      [parameter]: String(page),
    });
    return `/admin/fees/reports?${query.toString()}`;
  };
  const totalCollected =
    (parseMoneyToMinorUnits(paymentTotals?.amount ?? "0") ?? 0) -
    (parseMoneyToMinorUnits(reversalTotals?.amount ?? "0") ?? 0);
  const totalFines =
    (parseMoneyToMinorUnits(paymentTotals?.fineAmount ?? "0") ?? 0) -
    (parseMoneyToMinorUnits(reversalTotals?.fineAmount ?? "0") ?? 0);
  const totalOutstanding = outstandingInvoices.reduce((total, item) => total + item.balance, 0);
  const currency = school?.currency ?? "";

  return (
    <div className="space-y-6 print-report-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-700 print:text-black">Finance</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Fee reports</h1>
          <p className="mt-2 text-sm text-slate-600">Review payments, reversals, refunds, fines and outstanding balances by date, branch and class.</p>
        </div>
        <PrintButton label="Print report" targetId="fee-report-content" />
      </header>

      <FeeReportFilters
        from={from}
        to={to}
        branches={branchOptions}
        classes={classOptions}
        sections={sectionOptions}
        feeTypes={feeTypeOptions}
        statuses={statusOptions}
        selectedBranch={requestedBranch === null ? "" : String(requestedBranch)}
        selectedClass={requestedClass === null ? "" : String(requestedClass)}
        selectedSection={requestedSection === null ? "" : String(requestedSection)}
        selectedFeeType={requestedFeeTypeId === null ? "" : String(requestedFeeTypeId)}
        selectedStatus={requestedStatus}
      />

      <section id="fee-report-content" className="print-report-content space-y-6">
        <header className="print-report-heading">
          <p className="print-report-kicker">Finances · Fee report</p>
          <h2>Fee report</h2>
          <p>
            {from} through {to}
            {requestedBranch ? ` · ${branches.find((branch) => branch.id === requestedBranch)?.name ?? "Selected branch"}` : ""}
            {requestedClass ? ` · ${classes.find((item) => item.id === requestedClass)?.name ?? "Selected class"}` : ""}
            {requestedSection ? ` · ${sections.find((section) => section.id === requestedSection)?.name ?? "Selected section"}` : ""}
            {requestedFeeTypeId ? ` · ${feeTypesList.find((feeType) => feeType.id === requestedFeeTypeId)?.name ?? "Selected fee type"}` : ""}
            {requestedStatus ? ` · ${requestedStatus === "paid" ? "Fully paid" : requestedStatus === "partial" ? "Partially paid" : "Unpaid"} invoices` : ""}
          </p>
          <p className="text-xs">Invoice reports include invoices issued or due during this period. Payment and reversal reports use their transaction dates.</p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3 print:grid-cols-3">
          <SummaryCard label="Collected in period" value={`${currency} ${money(totalCollected)}`} />
          <SummaryCard label="Fines collected" value={`${currency} ${money(totalFines)}`} />
          <SummaryCard label="Outstanding balance on period invoices" value={`${currency} ${money(totalOutstanding)}`} />
        </section>

        <ReportTable
          title="Payment report"
          description={`Payments recorded ${from} through ${to} in ${school?.timezone ?? "UTC"} local time.`}
          empty="No payments were recorded during this date range."
          headings={["Student", "Class / section", "Fee type", "Date", "Method", "Payment", "Reversed", "Fine", "Receipt"]}
          hasRows={payments.length > 0}
          pagination={payments.length || Number(paymentTotals?.count) > 0 ? (
            <TablePagination ariaLabel="Fee payments" currentPage={paymentPage} pageSize={pageSize}
              totalRows={Number(paymentTotals?.count ?? 0)} hrefForPage={(page) => reportPageHref("paymentsPage", page)} />
          ) : null}
        >
          {payments.map((payment) => (
            <tr key={payment.publicId} className="border-t border-slate-100">
              <td className="px-4 py-3">{payment.studentName} {payment.studentLastName}<span className="block text-xs text-slate-500">{payment.admissionNumber || "—"} · {payment.rollNumber || "—"}</span></td>
              <td className="px-4 py-3">{payment.branchName} / {payment.className} / {payment.sectionName}</td>
              <td className="px-4 py-3">{payment.feeTypeName}</td>
              <td className="px-4 py-3">{formatFeeReportDate(payment.paidAt, school?.timezone ?? "UTC")}</td>
              <td className="px-4 py-3 capitalize">{payment.paymentMethod.replace("_", " ")}</td>
              <td className="px-4 py-3">{currency} {payment.amount}</td>
              <td className="px-4 py-3">{currency} {payment.reversedAmount}</td>
              <td className="px-4 py-3">{currency} {payment.fineAmount}</td>
              <td className="px-4 py-3"><Link className="font-semibold text-violet-700 hover:text-violet-900" href={`/admin/fees/receipt/${payment.publicId}`}>{payment.receiptNumber}</Link></td>
            </tr>
          ))}
        </ReportTable>

        <ReportTable
          title="Reversals and refunds"
          description={`Reversals recorded ${from} through ${to}.`}
          empty="No payment reversals or refunds were recorded during this date range."
          headings={["Student", "Class / section", "Date", "Type", "Amount", "Reason", "Receipt"]}
          hasRows={reversals.length > 0}
          pagination={reversals.length || Number(reversalTotals?.count) > 0 ? (
            <TablePagination ariaLabel="Fee reversals" currentPage={reversalPage} pageSize={pageSize}
              totalRows={Number(reversalTotals?.count ?? 0)} hrefForPage={(page) => reportPageHref("reversalsPage", page)} />
          ) : null}
        >
          {reversals.map((reversal) => (
            <tr key={reversal.publicId} className="border-t border-slate-100">
              <td className="px-4 py-3">{reversal.studentName} {reversal.studentLastName}</td>
              <td className="px-4 py-3">{reversal.branchName} / {reversal.className} / {reversal.sectionName}</td>
              <td className="px-4 py-3">{formatFeeReportDate(reversal.createdAt, school?.timezone ?? "UTC")}</td>
              <td className="px-4 py-3 capitalize">{reversal.reversalType}</td>
              <td className="px-4 py-3">{currency} {reversal.amount}</td>
              <td className="px-4 py-3">{reversal.reason}{reversal.reference ? ` · Ref ${reversal.reference}` : ""}</td>
              <td className="px-4 py-3"><Link className="font-semibold text-violet-700 hover:text-violet-900" href={`/admin/fees/receipt/${reversal.paymentPublicId}`}>{reversal.receiptNumber}</Link></td>
            </tr>
          ))}
        </ReportTable>

        <ReportTable
          title="Invoice totals by fee type"
          description="Totals for invoices issued or due in the selected date range. Configured fee types with no matching invoices remain visible with zero totals."
          empty="No invoices match the selected filters."
          headings={["Fee type", "Invoices", "Amount due", "Amount paid", "Balance"]}
          hasRows={feeTypeSummary.length > 0}
          pagination={feeTypeSummary.length > 0 ? (
            <TablePagination ariaLabel="Invoice totals by fee type" currentPage={feeTypePage} pageSize={pageSize}
              totalRows={feeTypeSummary.length} hrefForPage={(page) => reportPageHref("feeTypesPage", page)} />
          ) : null}
        >
          {visibleFeeTypeSummary.map(([feeTypeId, totals]) => (
            <tr key={feeTypeId} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium">{totals.name}</td>
              <td className="px-4 py-3">{totals.count}</td>
              <td className="px-4 py-3">{currency} {money(totals.due)}</td>
              <td className="px-4 py-3">{currency} {money(totals.paid)}</td>
              <td className="px-4 py-3 font-semibold">{currency} {money(totals.balance)}</td>
            </tr>
          ))}
        </ReportTable>
        <ReportTable
          title="Invoice payment status report"
          description={`Invoices issued or due ${from} through ${to}${requestedStatus ? ` with ${requestedStatus === "paid" ? "full payment" : requestedStatus === "partial" ? "partial payment" : "no payment"}` : " across all payment statuses"}; balance includes applicable late fines.`}
          empty={`No ${requestedStatus ? `${requestedStatus} ` : ""}invoices were issued or are due in this date range.`}
          headings={["Student", "Class / section", "Fee type", "Due date", "Paid", "Balance", "Status"]}
          hasRows={filteredInvoices.length > 0}
          pagination={filteredInvoices.length > 0 ? (
            <TablePagination ariaLabel="Invoice payment status" currentPage={invoicePage} pageSize={pageSize}
              totalRows={filteredInvoices.length} hrefForPage={(page) => reportPageHref("invoicesPage", page)} />
          ) : null}
        >
          {visibleInvoices.map((invoice) => (
            <tr key={invoice.id} className="border-t border-slate-100">
              <td className="px-4 py-3">{invoice.studentName} {invoice.studentLastName}<span className="block text-xs text-slate-500">{invoice.admissionNumber || "—"} · {invoice.rollNumber || "—"}</span></td>
              <td className="px-4 py-3">{invoice.branchName} / {invoice.className} / {invoice.sectionName}</td>
              <td className="px-4 py-3">{invoice.feeTypeName}</td>
              <td className="px-4 py-3">{invoice.dueDate}</td>
              <td className="px-4 py-3">{currency} {money(invoice.paid)}</td>
              <td className="px-4 py-3 font-semibold">{currency} {money(invoice.balance)}</td>
              <td className="px-4 py-3 capitalize">{invoice.status}</td>
            </tr>
          ))}
        </ReportTable>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ReportTable({
  title,
  description,
  headings,
  empty,
  hasRows,
  pagination,
  children,
}: {
  title: string;
  description: string;
  headings: string[];
  empty: string;
  hasRows: boolean;
  pagination?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="print-report-panel overflow-hidden rounded-2xl border border-slate-200 bg-white print:overflow-visible print:break-inside-avoid">
      <div className="p-5">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {hasRows ? (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[860px] text-left text-sm print:min-w-0 print:text-xs">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>{headings.map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody className="text-slate-700">{children}</tbody>
          </table>
        </div>
      ) : <p className="px-5 pb-5 text-sm text-slate-500">{empty}</p>}
      {pagination}
    </section>
  );
}
