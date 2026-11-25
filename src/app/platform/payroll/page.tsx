import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { AdminDataTable } from "@/components/admin-data-table";
import { db } from "@/db";
import {
  chartOfAccounts,
  schoolBankAccounts,
  schools,
  staffMembers,
  staffPayrollRecords,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-access";
import { PlatformPayrollPaymentForm } from "./platform-payroll-payment-form";

export const dynamic = "force-dynamic";

export default async function PlatformPayrollPage() {
  await requirePlatformAdmin();

  const activeSchools = await db.select({
    id: schools.id,
    publicId: schools.publicId,
    name: schools.name,
  }).from(schools).where(and(
    eq(schools.status, "active"),
    eq(schools.isPracticeWorkspace, false),
    isNull(schools.archivedAt),
  )).orderBy(asc(schools.name));
  const schoolIds = activeSchools.map((school) => school.id);

  const [payrollRecords, expenseAccounts, bankAccounts] = schoolIds.length
    ? await Promise.all([
        db.select({
          schoolId: schools.id,
          schoolPublicId: schools.publicId,
          schoolName: schools.name,
          publicId: staffPayrollRecords.publicId,
          payPeriod: staffPayrollRecords.payPeriod,
          amount: staffPayrollRecords.amount,
          currency: staffPayrollRecords.currency,
          staffName: staffMembers.firstName,
          staffLastName: staffMembers.lastName,
          employeeCode: staffMembers.employeeCode,
        }).from(staffPayrollRecords)
          .innerJoin(schools, eq(schools.id, staffPayrollRecords.schoolId))
          .innerJoin(staffMembers, and(
            eq(staffMembers.id, staffPayrollRecords.staffId),
            eq(staffMembers.schoolId, staffPayrollRecords.schoolId),
          ))
          .where(and(
            inArray(staffPayrollRecords.schoolId, schoolIds),
            eq(staffPayrollRecords.status, "recorded"),
            eq(schools.status, "active"),
            eq(schools.isPracticeWorkspace, false),
            isNull(schools.archivedAt),
          ))
          .orderBy(desc(staffPayrollRecords.payPeriod), asc(schools.name), asc(staffMembers.lastName), asc(staffMembers.firstName)),
        db.select({
          schoolId: chartOfAccounts.schoolId,
          id: chartOfAccounts.id,
          code: chartOfAccounts.code,
          name: chartOfAccounts.name,
        }).from(chartOfAccounts).where(and(
          inArray(chartOfAccounts.schoolId, schoolIds),
          eq(chartOfAccounts.accountType, "expense"),
          eq(chartOfAccounts.status, "active"),
        )).orderBy(asc(chartOfAccounts.code)),
        db.select({
          schoolId: schoolBankAccounts.schoolId,
          id: schoolBankAccounts.id,
          accountName: schoolBankAccounts.accountName,
          bankName: schoolBankAccounts.bankName,
          currency: schoolBankAccounts.currency,
        }).from(schoolBankAccounts).where(and(
          inArray(schoolBankAccounts.schoolId, schoolIds),
          eq(schoolBankAccounts.status, "active"),
        )).orderBy(asc(schoolBankAccounts.accountName)),
      ])
    : [[], [], []];

  const currentDate = new Date().toISOString().slice(0, 10);
  const schoolFilters = activeSchools.map((school) => ({
    value: school.publicId,
    label: school.name,
  }));
  const rows = payrollRecords.map((record) => {
    const recordBanks = bankAccounts.filter((bank) =>
      bank.schoolId === record.schoolId && bank.currency === record.currency
    ).map((bank) => ({
      id: String(bank.id),
      label: `${bank.accountName} · ${bank.bankName}`,
    }));
    const recordExpenseAccounts = expenseAccounts
      .filter((account) => account.schoolId === record.schoolId)
      .map((account) => ({
        id: String(account.id),
        label: `${account.code} · ${account.name}`,
      }));
    const defaultExpenseAccount = recordExpenseAccounts.find((account) =>
      /salary|staff|payroll/i.test(account.label)
    ) ?? recordExpenseAccounts[0];
    const paymentAction = recordBanks.length && recordExpenseAccounts.length ? (
      <PlatformPayrollPaymentForm
        schoolPublicId={record.schoolPublicId}
        payrollPublicId={record.publicId}
        banks={recordBanks}
        expenseAccounts={recordExpenseAccounts}
        defaultExpenseAccountId={defaultExpenseAccount?.id ?? ""}
        currentDate={currentDate}
      />
    ) : (
      <p className="max-w-xs text-xs text-amber-800">
        This workspace needs an active expense category and a matching-currency bank or cash account before this payment can be recorded.
      </p>
    );

    return {
      id: record.publicId,
      searchableText: `${record.schoolName} ${record.staffName} ${record.staffLastName} ${record.employeeCode ?? ""} ${record.payPeriod} ${record.amount} ${record.currency}`,
      values: {
        school: record.schoolName,
        schoolFilter: record.schoolPublicId,
        staff: `${record.staffName} ${record.staffLastName}`,
        employeeCode: record.employeeCode ?? "",
        period: record.payPeriod,
        amount: `${record.amount} ${record.currency}`,
      },
      actions: paymentAction,
    };
  });

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-700">SchoolOS platform</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Staff payroll</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Review recorded payroll across active school workspaces and record staff payments against each school&apos;s own accounts.
          </p>
          <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            Use this after paying staff externally. SchoolOS records the expense and marks payroll paid; it does not transfer funds.
          </p>
        </header>

        <AdminDataTable
          title={`Awaiting payment · ${payrollRecords.length}`}
          columns={[
            { key: "school", label: "School workspace" },
            { key: "staff", label: "Staff member" },
            { key: "employeeCode", label: "Employee code" },
            { key: "period", label: "Pay period" },
            { key: "amount", label: "Net pay" },
          ]}
          filters={[{
            key: "schoolFilter",
            label: "School",
            options: schoolFilters,
          }]}
          rows={rows}
          emptyMessage="No unpaid payroll records are available in active school workspaces."
          mobileCardView
          showRowNumber={false}
        />
      </div>
    </main>
  );
}
