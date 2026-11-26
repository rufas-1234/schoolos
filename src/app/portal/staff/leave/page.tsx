import { and, asc, count, desc, eq, inArray, sum } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CalendarDays, Check, Clock3, X } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { db } from "@/db";
import { staffLeaveBalances, staffLeaveRequests, staffLeaveTypes, staffMembers } from "@/db/schema";
import { requireSchoolMember } from "@/lib/access-control";
import { LeaveApplicationForm } from "./leave-application-form";

export const dynamic = "force-dynamic";

export default async function MyStaffLeavePage() {
  const context = await requireSchoolMember();
  const [staff] = await db.select({
    id: staffMembers.id,
    firstName: staffMembers.firstName,
    lastName: staffMembers.lastName,
    employeeCode: staffMembers.employeeCode,
  }).from(staffMembers).where(and(
    eq(staffMembers.schoolId, context.schoolId),
    eq(staffMembers.linkedUserId, context.user.id),
    eq(staffMembers.status, "active"),
  )).limit(1);
  if (!staff) notFound();

  const [balances, requests, requestCounts] = await Promise.all([
    db.select({
      leaveTypeId: staffLeaveBalances.leaveTypeId,
      leaveTypeName: staffLeaveTypes.name,
      leaveYear: staffLeaveBalances.leaveYear,
      entitlementDays: staffLeaveBalances.entitlementDays,
    }).from(staffLeaveBalances)
      .innerJoin(staffLeaveTypes, and(
        eq(staffLeaveBalances.leaveTypeId, staffLeaveTypes.id),
        eq(staffLeaveTypes.schoolId, context.schoolId),
      ))
      .where(and(
        eq(staffLeaveBalances.schoolId, context.schoolId),
        eq(staffLeaveBalances.staffId, staff.id),
      ))
      .orderBy(desc(staffLeaveBalances.leaveYear), asc(staffLeaveTypes.name)),
    db.select({
      publicId: staffLeaveRequests.publicId,
      leaveTypeName: staffLeaveTypes.name,
      leaveYear: staffLeaveRequests.leaveYear,
      startDate: staffLeaveRequests.startDate,
      endDate: staffLeaveRequests.endDate,
      requestedDays: staffLeaveRequests.requestedDays,
      reason: staffLeaveRequests.reason,
      status: staffLeaveRequests.status,
      reviewNote: staffLeaveRequests.reviewNote,
      createdAt: staffLeaveRequests.createdAt,
    }).from(staffLeaveRequests)
      .innerJoin(staffLeaveTypes, and(
        eq(staffLeaveRequests.leaveTypeId, staffLeaveTypes.id),
        eq(staffLeaveTypes.schoolId, context.schoolId),
      ))
      .where(and(
        eq(staffLeaveRequests.schoolId, context.schoolId),
        eq(staffLeaveRequests.staffId, staff.id),
      ))
      .orderBy(desc(staffLeaveRequests.createdAt))
      .limit(100),
    db.select({ status: staffLeaveRequests.status, total: count() })
      .from(staffLeaveRequests)
      .where(and(
        eq(staffLeaveRequests.schoolId, context.schoolId),
        eq(staffLeaveRequests.staffId, staff.id),
      ))
      .groupBy(staffLeaveRequests.status),
  ]);
  const currentYear = new Date().getFullYear();
  const pendingCount = Number(requestCounts.find((request) => request.status === "pending")?.total ?? 0);
  const approvedCount = Number(requestCounts.find((request) => request.status === "approved")?.total ?? 0);
  const currentYearBalances = balances.filter((balance) => balance.leaveYear === currentYear);
  const currentYearUsage = await db.select({
    leaveTypeId: staffLeaveRequests.leaveTypeId,
    status: staffLeaveRequests.status,
    days: sum(staffLeaveRequests.requestedDays),
  }).from(staffLeaveRequests).where(and(
    eq(staffLeaveRequests.schoolId, context.schoolId),
    eq(staffLeaveRequests.staffId, staff.id),
    eq(staffLeaveRequests.leaveYear, currentYear),
    inArray(staffLeaveRequests.status, ["pending", "approved"]),
  )).groupBy(staffLeaveRequests.leaveTypeId, staffLeaveRequests.status);
  const reservedByType = new Map<number, number>();
  for (const item of currentYearUsage) {
    reservedByType.set(item.leaveTypeId, (reservedByType.get(item.leaveTypeId) ?? 0) + Number(item.days ?? 0));
  }
  const availableDays = currentYearBalances.reduce((total, balance) =>
    total + Math.max(0, Number(balance.entitlementDays) - (reservedByType.get(balance.leaveTypeId) ?? 0)), 0);
  const leaveTypesById = new Map<number, { id: number; name: string; years: number[] }>();
  for (const balance of balances) {
    const option = leaveTypesById.get(balance.leaveTypeId) ?? {
      id: balance.leaveTypeId,
      name: balance.leaveTypeName,
      years: [],
    };
    option.years.push(balance.leaveYear);
    leaveTypesById.set(balance.leaveTypeId, option);
  }
  const leaveTypes = [...leaveTypesById.values()];

  return (
    <PortalShell
      schoolName={context.schoolName}
      schoolLogoUrl={context.schoolLogoUrl}
      schoolAddress={context.schoolAddress}
      schoolPhone={context.schoolPhone}
      schoolEmail={context.schoolEmail}
      userName={`${staff.firstName} ${staff.lastName}`}
      portalLabel="Staff workspace"
      navigation={[{ href: "/portal/staff/leave", label: "My leave", icon: CalendarDays }]}
      schoolChoices={context.schoolChoices}
      currentSchoolPublicId={context.schoolPublicId}
    >
      <main className="space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/80 p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-violet-700">Staff workspace{staff.employeeCode ? ` · ${staff.employeeCode}` : ""}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">My leave</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Apply for leave and check your entitlements and request decisions.</p>
        </header>

        <section aria-label="Leave summary" className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Available days this year" value={availableDays.toFixed(2)} icon={<CalendarDays size={19} />} />
          <SummaryCard label="Pending requests" value={String(pendingCount)} icon={<Clock3 size={19} />} />
          <SummaryCard label="Approved requests" value={String(approvedCount)} icon={<Check size={19} />} />
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <LeaveApplicationForm leaveTypes={leaveTypes} />
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-900">My leave entitlements</h2>
              <p className="mt-1 text-sm text-slate-500">Available days include pending requests reserved for review.</p>
            </div>
            {balances.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-3">Leave type</th><th className="px-4 py-3">Year</th><th className="px-4 py-3">Entitled</th><th className="px-4 py-3">Reserved</th><th className="px-4 py-3">Available</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {balances.map((balance) => {
                      const reserved = reservedByType.get(balance.leaveTypeId) ?? 0;
                      return <tr key={`${balance.leaveTypeId}-${balance.leaveYear}`}>
                        <td className="px-4 py-3 font-medium text-slate-800">{balance.leaveTypeName}</td>
                        <td className="px-4 py-3 text-slate-600">{balance.leaveYear}</td>
                        <td className="px-4 py-3 text-slate-600">{Number(balance.entitlementDays).toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-600">{balance.leaveYear === currentYear ? reserved.toFixed(2) : "—"}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{balance.leaveYear === currentYear ? Math.max(0, Number(balance.entitlementDays) - reserved).toFixed(2) : "—"}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="p-6 text-sm text-slate-500">HR has not assigned leave entitlements yet.</p>}
          </section>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">My leave requests</h2>
            <p className="mt-1 text-sm text-slate-500">Your latest {requests.length} requests.</p>
          </div>
          {requests.length ? <ul className="divide-y divide-slate-100">
            {requests.map((request) => <li key={request.publicId} className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{request.leaveTypeName} · {request.leaveYear}</p>
                <p className="mt-1 text-sm text-slate-600">{request.startDate} – {request.endDate} · {request.requestedDays} calendar days</p>
                <p className="mt-1 break-words text-sm text-slate-500">{request.reason}</p>
                {request.reviewNote && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">HR note: {request.reviewNote}</p>}
              </div>
              <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${request.status === "approved" ? "bg-emerald-50 text-emerald-700" : request.status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                {request.status === "rejected" ? <X size={13} /> : request.status === "approved" ? <Check size={13} /> : <Clock3 size={13} />}{request.status}
              </span>
            </li>)}
          </ul> : <p className="p-7 text-center text-sm text-slate-500">You have not submitted a leave request yet.</p>}
        </section>
      </main>
    </PortalShell>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3 text-sm font-medium text-slate-600"><span>{label}</span><span className="text-violet-700">{icon}</span></div>
    <p className="mt-3 text-2xl font-bold tabular-nums text-slate-950">{value}</p>
  </article>;
}
