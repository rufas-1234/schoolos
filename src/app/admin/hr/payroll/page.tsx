import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { schoolBranches, schools, staffMembers, staffPayrollRecords } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import {
  parsePayrollMoneyToMinorUnits,
  parseStaffPayrollFilter,
} from "@/lib/hr-policy";
import { PrintButton } from "@/components/print-button";
import { MarkPayrollPaidForm, PayrollForm } from "../hr-forms";

function isPayPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export default async function StaffPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[]; branchId?: string | string[]; status?: string | string[] }>;
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
  const formatter = (amount: number | bigint, amountCurrency = currency) => {
    const minor = BigInt(amount);
    const hundred = BigInt(100);
    return `${amountCurrency} ${new Intl.NumberFormat("en").format(minor / hundred)}.${String(minor % hundred).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-7 print-report-page">
      <header>
        <p className="text-sm font-medium text-violet-700">Human resources</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Payroll records</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Prepare monthly staff payroll, calculate gross and net pay, track payment status, and print the filtered payroll report.
        </p>
      </header>

      <form method="get" className="print:hidden flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Branch
          <select name="branchId" required defaultValue={branchId?.toString() ?? ""} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <option value="" disabled>Select a branch</option>
            {branches.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
          </select>
        </label>
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
            <p>{branch ? `${branch.name} · ` : ""}{payPeriod} · {selectedStatus === "all" ? "All payment statuses" : selectedStatus}</p>
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
                    <th className="px-4 py-3 font-semibold print:hidden">Action</th>
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
                        {record.status === "recorded" ? <MarkPayrollPaidForm publicId={record.publicId} /> : "—"}
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

function minorUnits(value: string, label: string): number {
  const amount = parsePayrollMoneyToMinorUnits(value);
  if (amount === null) throw new Error(`Invalid stored payroll ${label} amount.`);
  return amount;
}
