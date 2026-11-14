import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { schoolBranches, schools, staffMembers, staffPayrollRecords } from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { MarkPayrollPaidForm, PayrollForm } from "../hr-forms";

function isPayPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export default async function StaffPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[]; branchId?: string | string[] }>;
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
      ))
      .orderBy(desc(staffPayrollRecords.createdAt), asc(staffMembers.lastName)),
  ]);
  const currency = school.currency;
  const total = records.reduce((sum, record) => sum + Number(record.amount), 0);
  const paidCount = records.filter((record) => record.status === "paid").length;
  const staffOptions = staff.map((member) => ({
    value: String(member.id),
    label: `${member.firstName} ${member.lastName}`,
  }));
  const formatter = new Intl.NumberFormat("en", { style: "currency", currency });

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-medium text-violet-700">Human resources</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Payroll records</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Record amounts paid or due and review period totals. This module does not calculate tax, deductions, benefits, or net pay.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Period" value={payPeriod} />
        <SummaryCard label="Payroll total" value={formatter.format(total)} />
        <SummaryCard label="Marked paid" value={`${paidCount} of ${records.length}`} />
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
        <button className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">View report</button>
      </form>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.5fr)]">
        {branch ? (
          <PayrollForm
            branchId={branch.id}
            branchName={`${branch.name} (${branch.code})`}
            staffOptions={staffOptions}
            currency={currency}
            payPeriod={payPeriod}
          />
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Create an active branch before recording payroll.</p>
        )}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900">Payroll report</h2>
            <p className="mt-2 text-sm text-slate-500">{branch ? `${branch.name} · ` : ""}{payPeriod}</p>
          </div>
          {records.length === 0 ? (
            <p className="p-7 text-center text-sm text-slate-500">No payroll records for {payPeriod}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[38rem] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3 font-semibold">Staff member</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Paid date</th><th className="px-4 py-3 font-semibold">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((record) => (
                    <tr key={record.publicId}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{record.staffName} {record.staffLastName}</p>
                        {record.employeeCode && <p className="mt-0.5 text-xs text-slate-400">{record.employeeCode}</p>}
                        {record.notes && <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{record.notes}</p>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{new Intl.NumberFormat("en", { style: "currency", currency: record.currency }).format(Number(record.amount))}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          record.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}>{record.status === "paid" ? "Paid" : "Recorded"}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.paidDate ?? "—"}</td>
                      <td className="px-4 py-3">
                        {record.status === "recorded" ? <MarkPayrollPaidForm publicId={record.publicId} /> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-slate-900">{value}</p></article>;
}
