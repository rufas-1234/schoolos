import type { ReactNode } from "react";
import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { schoolBranches, schools, staffMembers, staffPayrollRecords } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { AdminRecordDialog } from "@/components/admin-data-table";
import {
  parsePayrollMoneyToMinorUnits,
  parseStaffPayrollFilter,
} from "@/lib/hr-policy";
import { PrintButton } from "@/components/print-button";
import {
  DeletePayrollForm,
  MarkPayrollPaidForm,
  PayrollForm,
  PayrollRecordPrintButton,
} from "../hr-forms";
import { SearchableSelect } from "@/components/searchable-select";

function isPayPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export default async function StaffPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[]; branchId?: string | string[]; status?: string | string[]; search?: string | string[] }>;
}) {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const params = await searchParams;
  const [schoolResult, branches] = await Promise.all([
    db.select({
      currency: schools.currency,
      timezone: schools.timezone,
    }).from(schools).where(eq(schools.id, context.schoolId)).limit(1),
    db.select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code })
      .from(schoolBranches)
      .where(and(
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ))
      .orderBy(asc(schoolBranches.name)),
  ]);
  const school = schoolResult[0];
  if (!school) throw new Error("School settings could not be loaded.");
  const requestedBranchId = typeof params.branchId === "string" ? Number(params.branchId) : NaN;
  const branch = branches.find((item) => item.id === requestedBranchId) ?? branches[0];
  const branchId = branch?.id;
  const currentPeriod = new Intl.DateTimeFormat("en-CA", { timeZone: school.timezone })
    .format(new Date()).slice(0, 7);
  const payPeriod = typeof params.period === "string" && isPayPeriod(params.period)
    ? params.period
    : currentPeriod;
  const selectedStatus = parseStaffPayrollFilter(typeof params.status === "string" ? params.status : "");
  const staffSearch = typeof params.search === "string" ? params.search.trim().slice(0, 120) : "";
  const [staff, records] = await Promise.all([
    db.select({
      id: staffMembers.id,
      firstName: staffMembers.firstName,
      lastName: staffMembers.lastName,
    }).from(staffMembers)
      .where(and(
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.status, "active"),
        eq(staffMembers.branchId, branchId ?? 0),
      ))
      .orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db.select({
      publicId: staffPayrollRecords.publicId,
      staffId: staffPayrollRecords.staffId,
      staffName: staffMembers.firstName,
      staffLastName: staffMembers.lastName,
      employeeCode: staffMembers.employeeCode,
      baseSalary: staffPayrollRecords.baseSalary,
      allowances: staffPayrollRecords.allowances,
      deductions: staffPayrollRecords.deductions,
      amount: staffPayrollRecords.amount,
      currency: staffPayrollRecords.currency,
      payPeriod: staffPayrollRecords.payPeriod,
      paidDate: staffPayrollRecords.paidDate,
      status: staffPayrollRecords.status,
      notes: staffPayrollRecords.notes,
    }).from(staffPayrollRecords)
      .innerJoin(staffMembers, and(
        eq(staffPayrollRecords.staffId, staffMembers.id),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .where(and(
        eq(staffPayrollRecords.schoolId, context.schoolId),
        eq(staffPayrollRecords.payPeriod, payPeriod),
        eq(staffMembers.branchId, branchId ?? 0),
        ...(selectedStatus === "all" ? [] : [eq(staffPayrollRecords.status, selectedStatus)]),
        ...(staffSearch ? [or(
          like(staffMembers.firstName, `%${staffSearch}%`),
          like(staffMembers.lastName, `%${staffSearch}%`),
          like(staffMembers.employeeCode, `%${staffSearch}%`),
        )!] : []),
      ))
      .orderBy(desc(staffPayrollRecords.createdAt), asc(staffMembers.lastName)),
  ]);
  const currency = school.currency;
  const totalsByCurrency = new Map<string, { gross: bigint; deductions: bigint; net: bigint }>();
  for (const record of records) {
    const totals = totalsByCurrency.get(record.currency) ?? {
      gross: BigInt(0),
      deductions: BigInt(0),
      net: BigInt(0),
    };
    totals.gross += BigInt(minorUnits(record.baseSalary, "base salary")) +
      BigInt(minorUnits(record.allowances, "allowances"));
    totals.deductions += BigInt(minorUnits(record.deductions, "deductions"));
    totals.net += BigInt(minorUnits(record.amount, "net pay"));
    totalsByCurrency.set(record.currency, totals);
  }
  const paidCount = records.filter((record) => record.status === "paid").length;
  const staffOptions = staff.map((member) => ({
    value: String(member.id),
    label: `${member.firstName} ${member.lastName}`,
  }));
  const staffOptionsForEditing = [...staffOptions];
  for (const record of records) {
    if (!staffOptionsForEditing.some((option) => option.value === String(record.staffId))) {
      staffOptionsForEditing.push({
        value: String(record.staffId),
        label: `${record.staffName} ${record.staffLastName}${record.employeeCode ? ` (${record.employeeCode})` : ""}`,
      });
    }
  }
  const formatter = (amount: number | bigint, amountCurrency = currency) => {
    const minor = BigInt(amount);
    const hundred = BigInt(100);
    return `${amountCurrency} ${new Intl.NumberFormat("en").format(minor / hundred)}.${String(minor % hundred).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-7 print-report-page payroll-report-page">
      <header>
        <p className="text-sm font-medium text-violet-700">Human resources</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Payroll records</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Prepare monthly staff payroll, calculate gross and net pay, track payment status, and print the filtered payroll report.
        </p>
      </header>

      <form method="get" className="print:hidden flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <SearchableSelect
          label="Branch"
          name="branchId"
          options={branches.map((item) => ({ value: String(item.id), label: `${item.name} (${item.code})` }))}
          required
          defaultValue={branchId?.toString() ?? ""}
          placeholder="Search branches..."
          disabled={!branches.length}
        />
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Pay period
          <input type="month" name="period" defaultValue={payPeriod} required className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Payment status
          <select name="status" defaultValue={selectedStatus} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <option value="all">All statuses</option>
            <option value="recorded">Recorded, not paid</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Search staff
          <input type="search" name="search" maxLength={120} defaultValue={staffSearch} placeholder="Name or staff number" className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">View report</button>
      </form>

      <div className="print:hidden">
        {branch ? (
          <PayrollForm
            branchId={branch.id}
            branchName={branch.name}
            staffOptions={staffOptions}
            currency={currency}
            payPeriod={payPeriod}
          />
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Create an active branch before recording payroll.</p>
        )}
      </div>

      <section className="print-report-content space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4 print-report-heading">
          <div>
            <p className="print-report-kicker">Human resources · Payroll</p>
            <h2>Payroll report</h2>
            <p>{branch ? `${branch.name} · ` : ""}{payPeriod} · {selectedStatus === "all" ? "All payment statuses" : selectedStatus}{staffSearch ? ` · Search: ${staffSearch}` : ""}</p>
          </div>
          <PrintButton label="Print payroll report" />
        </header>
        <section className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Staff on report" value={String(records.length)} />
          <SummaryCard label="Paid records" value={`${paidCount} of ${records.length}`} />
        </section>
        <section className="grid gap-3 sm:grid-cols-3">
          {[...totalsByCurrency].map(([amountCurrency, totals]) => (
            <div key={amountCurrency} className="contents">
              <SummaryCard label={`Gross payroll · ${amountCurrency}`} value={formatter(totals.gross, amountCurrency)} />
              <SummaryCard label={`Deductions · ${amountCurrency}`} value={formatter(totals.deductions, amountCurrency)} />
              <SummaryCard label={`Net payroll · ${amountCurrency}`} value={formatter(totals.net, amountCurrency)} />
            </div>
          ))}
        </section>
        <section className="print-report-panel overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h3 className="font-semibold text-slate-900">Staff payroll details</h3>
            <p className="mt-2 text-sm text-slate-500">{records.length} payroll records · Amounts in {currency}</p>
          </div>
          {records.length === 0 ? (
            <p className="p-7 text-center text-sm text-slate-500">No payroll records for {payPeriod}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="print-report-table w-full min-w-[66rem] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Staff member</th>
                    <th className="px-4 py-3 font-semibold">Base salary</th>
                    <th className="px-4 py-3 font-semibold">Allowances</th>
                    <th className="px-4 py-3 font-semibold">Gross pay</th>
                    <th className="px-4 py-3 font-semibold">Deductions</th>
                    <th className="px-4 py-3 font-semibold">Net pay</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Paid date</th>
                    <th className="px-4 py-3 font-semibold print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((record) => (
                    <tr key={record.publicId}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{record.staffName} {record.staffLastName}</p>
                        {record.employeeCode && <p className="mt-0.5 text-xs text-slate-400">{record.employeeCode}</p>}
                        {record.notes && <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{record.notes}</p>}
                      </td>
                      <td className="px-4 py-3">{formatter(minorUnits(record.baseSalary, "base salary"), record.currency)}</td>
                      <td className="px-4 py-3">{formatter(minorUnits(record.allowances, "allowances"), record.currency)}</td>
                      <td className="px-4 py-3">{formatter(minorUnits(record.baseSalary, "base salary") + minorUnits(record.allowances, "allowances"), record.currency)}</td>
                      <td className="px-4 py-3">{formatter(minorUnits(record.deductions, "deductions"), record.currency)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{formatter(minorUnits(record.amount, "net pay"), record.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          record.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}>{record.status === "paid" ? "Paid" : "Recorded"}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.paidDate ?? "—"}</td>
                      <td className="px-4 py-3 print:hidden">
                        <div className="flex min-w-64 flex-wrap items-center gap-1.5">
                          <AdminRecordDialog title={`View payroll for ${record.staffName} ${record.staffLastName}`} mode="view">
                            <dl className="grid gap-3 sm:grid-cols-2">
                              <PayrollDetail label="Staff member">{record.staffName} {record.staffLastName}</PayrollDetail>
                              <PayrollDetail label="Staff number">{record.employeeCode ?? "—"}</PayrollDetail>
                              <PayrollDetail label="Pay period">{record.payPeriod}</PayrollDetail>
                              <PayrollDetail label="Status">{record.status === "paid" ? "Paid" : "Recorded, not paid"}</PayrollDetail>
                              <PayrollDetail label="Paid date">{record.paidDate ?? "—"}</PayrollDetail>
                              <PayrollDetail label="Base salary">{formatter(minorUnits(record.baseSalary, "base salary"), record.currency)}</PayrollDetail>
                              <PayrollDetail label="Allowances">{formatter(minorUnits(record.allowances, "allowances"), record.currency)}</PayrollDetail>
                              <PayrollDetail label="Deductions">{formatter(minorUnits(record.deductions, "deductions"), record.currency)}</PayrollDetail>
                              <PayrollDetail label="Net pay">{formatter(minorUnits(record.amount, "net pay"), record.currency)}</PayrollDetail>
                              <PayrollDetail label="Notes">{record.notes ?? "—"}</PayrollDetail>
                            </dl>
                          </AdminRecordDialog>
                          <AdminRecordDialog title={`Edit payroll for ${record.staffName} ${record.staffLastName}`} wide>
                            <PayrollForm
                              branchId={branchId ?? 0}
                              branchName={branch?.name ?? ""}
                              staffOptions={staffOptionsForEditing}
                              currency={currency}
                              payPeriod={payPeriod}
                              record={record}
                            />
                          </AdminRecordDialog>
                          <PayrollRecordPrintButton
                            publicId={record.publicId}
                            schoolName={context.schoolName}
                            staffName={`${record.staffName} ${record.staffLastName}`}
                            employeeCode={record.employeeCode}
                            baseSalary={formatter(minorUnits(record.baseSalary, "base salary"), record.currency)}
                            allowances={formatter(minorUnits(record.allowances, "allowances"), record.currency)}
                            deductions={formatter(minorUnits(record.deductions, "deductions"), record.currency)}
                            netPay={formatter(minorUnits(record.amount, "net pay"), record.currency)}
                            payPeriod={record.payPeriod}
                            paidDate={record.paidDate}
                            status={record.status}
                            notes={record.notes}
                          />
                          <DeletePayrollForm publicId={record.publicId} />
                          {record.status === "recorded" && <MarkPayrollPaidForm publicId={record.publicId} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-slate-900">{value}</p></article>;
}

function PayrollDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-slate-100 pb-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function minorUnits(value: string, label: string): number {
  const amount = parsePayrollMoneyToMinorUnits(value);
  if (amount === null) throw new Error(`Invalid stored payroll ${label} amount.`);
  return amount;
}
