import { and, asc, desc, eq, sum } from "drizzle-orm";
import { db } from "@/db";
import {
  staffLeaveBalances,
  staffLeaveRequests,
  staffLeaveTypes,
  staffMembers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { LeaveBalanceForm, LeaveRequestForm, LeaveReviewForm, LeaveTypeForm } from "../hr-forms";

export default async function StaffLeavePage() {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const [staff, types, balances, usage, requests] = await Promise.all([
    db.select({
      id: staffMembers.id,
      firstName: staffMembers.firstName,
      lastName: staffMembers.lastName,
    }).from(staffMembers)
      .where(and(eq(staffMembers.schoolId, context.schoolId), eq(staffMembers.status, "active")))
      .orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db.select({
      id: staffLeaveTypes.id,
      name: staffLeaveTypes.name,
    }).from(staffLeaveTypes)
      .where(eq(staffLeaveTypes.schoolId, context.schoolId))
      .orderBy(asc(staffLeaveTypes.name)),
    db.select({
      id: staffLeaveBalances.id,
      staffName: staffMembers.firstName,
      staffLastName: staffMembers.lastName,
      leaveTypeName: staffLeaveTypes.name,
      entitlementDays: staffLeaveBalances.entitlementDays,
      staffId: staffLeaveBalances.staffId,
      leaveTypeId: staffLeaveBalances.leaveTypeId,
      leaveYear: staffLeaveBalances.leaveYear,
    }).from(staffLeaveBalances)
      .innerJoin(staffMembers, and(
        eq(staffLeaveBalances.staffId, staffMembers.id),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .innerJoin(staffLeaveTypes, and(
        eq(staffLeaveBalances.leaveTypeId, staffLeaveTypes.id),
        eq(staffLeaveTypes.schoolId, context.schoolId),
      ))
      .where(eq(staffLeaveBalances.schoolId, context.schoolId))
      .orderBy(asc(staffMembers.lastName), asc(staffLeaveTypes.name)),
    db.select({
      staffId: staffLeaveRequests.staffId,
      leaveTypeId: staffLeaveRequests.leaveTypeId,
      leaveYear: staffLeaveRequests.leaveYear,
      status: staffLeaveRequests.status,
      days: sum(staffLeaveRequests.requestedDays),
    }).from(staffLeaveRequests)
      .where(eq(staffLeaveRequests.schoolId, context.schoolId))
      .groupBy(staffLeaveRequests.staffId, staffLeaveRequests.leaveTypeId, staffLeaveRequests.leaveYear, staffLeaveRequests.status),
    db.select({
      publicId: staffLeaveRequests.publicId,
      staffName: staffMembers.firstName,
      staffLastName: staffMembers.lastName,
      leaveTypeName: staffLeaveTypes.name,
      startDate: staffLeaveRequests.startDate,
      endDate: staffLeaveRequests.endDate,
      requestedDays: staffLeaveRequests.requestedDays,
      reason: staffLeaveRequests.reason,
      status: staffLeaveRequests.status,
      reviewNote: staffLeaveRequests.reviewNote,
    }).from(staffLeaveRequests)
      .innerJoin(staffMembers, and(
        eq(staffLeaveRequests.staffId, staffMembers.id),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .innerJoin(staffLeaveTypes, and(
        eq(staffLeaveRequests.leaveTypeId, staffLeaveTypes.id),
        eq(staffLeaveTypes.schoolId, context.schoolId),
      ))
      .where(eq(staffLeaveRequests.schoolId, context.schoolId))
      .orderBy(desc(staffLeaveRequests.createdAt))
      .limit(100),
  ]);
  const staffOptions = staff.map((member) => ({
    value: String(member.id),
    label: `${member.firstName} ${member.lastName}`,
  }));
  const leaveTypeOptions = types.map((type) => ({ value: String(type.id), label: type.name }));
  const currentLeaveYear = new Date().getFullYear();
  const usedDays = new Map<string, number>();
  const pendingDays = new Map<string, number>();
  for (const item of usage) {
    const key = `${item.staffId}:${item.leaveTypeId}:${item.leaveYear}`;
    if (item.status === "approved") {
      usedDays.set(key, (usedDays.get(key) ?? 0) + Number(item.days ?? 0));
    } else if (item.status === "pending") {
      pendingDays.set(key, (pendingDays.get(key) ?? 0) + Number(item.days ?? 0));
    }
  }

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-medium text-violet-700">Human resources</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Leave management</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Define leave types, assign an individual calendar-day entitlement to each staff member, then submit and review requests.
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-3">
        <LeaveTypeForm />
        <LeaveBalanceForm staffOptions={staffOptions} leaveTypeOptions={leaveTypeOptions} leaveYear={currentLeaveYear} />
        <LeaveRequestForm staffOptions={staffOptions} leaveTypeOptions={leaveTypeOptions} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Leave entitlements</h2>
          <p className="mt-1 text-sm text-slate-500">Entitlements are assigned per staff member, leave type, and calendar year.</p>
        </div>
        {balances.length === 0 ? (
          <p className="p-7 text-center text-sm text-slate-500">No entitlements assigned yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3 font-semibold">Staff member</th><th className="px-5 py-3 font-semibold">Leave type</th><th className="px-5 py-3 font-semibold">Year</th><th className="px-5 py-3 font-semibold">Entitled</th><th className="px-5 py-3 font-semibold">Approved</th><th className="px-5 py-3 font-semibold">Pending</th><th className="px-5 py-3 font-semibold">Available</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balances.map((balance) => {
                  const key = `${balance.staffId}:${balance.leaveTypeId}:${balance.leaveYear}`;
                  const entitlement = Number(balance.entitlementDays);
                  const approved = usedDays.get(key) ?? 0;
                  const pending = pendingDays.get(key) ?? 0;
                  return (
                    <tr key={balance.id}>
                      <td className="px-5 py-3 font-medium text-slate-800">{balance.staffName} {balance.staffLastName}</td>
                      <td className="px-5 py-3 text-slate-600">{balance.leaveTypeName}</td>
                      <td className="px-5 py-3 text-slate-600">{balance.leaveYear}</td>
                      <td className="px-5 py-3 text-slate-600">{entitlement}</td>
                      <td className="px-5 py-3 text-slate-600">{approved}</td>
                      <td className="px-5 py-3 text-slate-600">{pending}</td>
                      <td className="px-5 py-3 font-semibold text-slate-700">{Math.max(0, entitlement - approved - pending)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Leave requests</h2>
          <p className="mt-1 text-sm text-slate-500">Showing the latest 100 requests.</p>
        </div>
        {requests.length === 0 ? (
          <p className="p-7 text-center text-sm text-slate-500">No leave requests yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {requests.map((request) => (
              <li key={request.publicId} className="space-y-3 p-5">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div>
                    <p className="font-semibold text-slate-800">{request.staffName} {request.staffLastName} · {request.leaveTypeName}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {request.startDate} – {request.endDate} · {request.requestedDays} calendar days
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{request.reason}</p>
                    {request.reviewNote && <p className="mt-1 text-xs text-slate-500">Review note: {request.reviewNote}</p>}
                  </div>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                    request.status === "approved" ? "bg-emerald-50 text-emerald-700"
                      : request.status === "rejected" ? "bg-rose-50 text-rose-700"
                        : "bg-amber-50 text-amber-700"
                  }`}>
                    {request.status}
                  </span>
                </div>
                {request.status === "pending" && <LeaveReviewForm publicId={request.publicId} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
