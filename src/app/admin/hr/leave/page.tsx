import { and, asc, count, desc, eq, isNull, like, or, sum } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import {
  schoolBranches,
  staffLeaveBalances,
  staffLeaveRequests,
  staffLeaveTypes,
  staffMembers,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { resolveBranchFilterId } from "@/lib/branch-selection-policy";
import { LeaveBalanceForm, LeaveRequestForm, LeaveReviewForm, LeaveTypeForm } from "../hr-forms";
import { SearchableSelect } from "@/components/searchable-select";
import { SmartFilterForm } from "@/components/smart-filter-form";
import { PrintButton } from "@/components/print-button";
import { DownloadCsv } from "@/components/download-csv";

export default async function StaffLeavePage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    search?: string | string[];
    staffId?: string | string[];
    leaveTypeId?: string | string[];
    year?: string | string[];
    requestStatus?: string | string[];
  }>;
}) {
  const context = await requireSchoolPermission(["school.settings.manage", "staff.manage"]);
  const [branches, params] = await Promise.all([
    db.select({ id: schoolBranches.id, name: schoolBranches.name, code: schoolBranches.code })
      .from(schoolBranches)
      .where(and(
        eq(schoolBranches.schoolId, context.schoolId),
        eq(schoolBranches.status, "active"),
      ))
      .orderBy(asc(schoolBranches.name)),
    searchParams,
  ]);
  const branchId = resolveBranchFilterId(
    branches,
    typeof params.branchId === "string" ? params.branchId : undefined,
  );
  const branch = branches.find((item) => item.id === branchId);
  const branchName = branch?.name ?? "No active branch";
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 120) : "";
  const staffId = parsePositiveId(params.staffId);
  const leaveTypeId = parsePositiveId(params.leaveTypeId);
  const yearCandidate = typeof params.year === "string" ? params.year : "";
  const leaveYear = /^\d{4}$/.test(yearCandidate) ? Number(yearCandidate) : undefined;
  const statusCandidate = typeof params.requestStatus === "string" ? params.requestStatus : "";
  const requestStatus = ["pending", "approved", "rejected"].includes(statusCandidate)
    ? statusCandidate
    : "all";
  const [staff, types, requestCounts, balances, usage, requests] = await Promise.all([
    db.select({
      id: staffMembers.id,
      firstName: staffMembers.firstName,
      lastName: staffMembers.lastName,
    }).from(staffMembers)
      .where(and(
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.status, "active"),
        ...(branchId ? [eq(staffMembers.branchId, branchId)] : []),
      ))
      .orderBy(asc(staffMembers.lastName), asc(staffMembers.firstName)),
    db.select({
      id: staffLeaveTypes.id,
      name: staffLeaveTypes.name,
      branchId: staffLeaveTypes.branchId,
      branchName: schoolBranches.name,
    }).from(staffLeaveTypes)
      .leftJoin(schoolBranches, eq(staffLeaveTypes.branchId, schoolBranches.id))
      .where(and(
        eq(staffLeaveTypes.schoolId, context.schoolId),
        ...(branchId ? [or(
          eq(staffLeaveTypes.branchId, branchId),
          isNull(staffLeaveTypes.branchId),
        )] : []),
      ))
      .orderBy(asc(staffLeaveTypes.name)),
    db.select({ status: staffLeaveRequests.status, total: count() })
      .from(staffLeaveRequests)
      .innerJoin(staffMembers, and(
        eq(staffLeaveRequests.staffId, staffMembers.id),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .where(and(
        eq(staffLeaveRequests.schoolId, context.schoolId),
        ...(branchId ? [eq(staffMembers.branchId, branchId)] : []),
      ))
      .groupBy(staffLeaveRequests.status),
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
      .where(and(
        eq(staffLeaveBalances.schoolId, context.schoolId),
        ...(branchId ? [eq(staffMembers.branchId, branchId)] : []),
        ...(branchId ? [or(eq(staffLeaveTypes.branchId, branchId), isNull(staffLeaveTypes.branchId))] : []),
        ...(staffId ? [eq(staffLeaveBalances.staffId, staffId)] : []),
        ...(leaveTypeId ? [eq(staffLeaveBalances.leaveTypeId, leaveTypeId)] : []),
        ...(leaveYear ? [eq(staffLeaveBalances.leaveYear, leaveYear)] : []),
        ...(search ? [or(
          like(staffMembers.firstName, `%${search}%`),
          like(staffMembers.lastName, `%${search}%`),
          like(staffLeaveTypes.name, `%${search}%`),
        )!] : []),
      ))
      .orderBy(asc(staffMembers.lastName), asc(staffLeaveTypes.name)),
    db.select({
      staffId: staffLeaveRequests.staffId,
      leaveTypeId: staffLeaveRequests.leaveTypeId,
      leaveYear: staffLeaveRequests.leaveYear,
      status: staffLeaveRequests.status,
      days: sum(staffLeaveRequests.requestedDays),
    }).from(staffLeaveRequests)
      .innerJoin(staffMembers, and(
        eq(staffLeaveRequests.staffId, staffMembers.id),
        eq(staffMembers.schoolId, context.schoolId),
      ))
      .where(and(
        eq(staffLeaveRequests.schoolId, context.schoolId),
        ...(branchId ? [eq(staffMembers.branchId, branchId)] : []),
      ))
      .groupBy(staffLeaveRequests.staffId, staffLeaveRequests.leaveTypeId, staffLeaveRequests.leaveYear, staffLeaveRequests.status),
    db.select({
      publicId: staffLeaveRequests.publicId,
      staffName: staffMembers.firstName,
      staffLastName: staffMembers.lastName,
      leaveTypeName: staffLeaveTypes.name,
      leaveYear: staffLeaveRequests.leaveYear,
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
      .where(and(
        eq(staffLeaveRequests.schoolId, context.schoolId),
        ...(branchId ? [eq(staffMembers.branchId, branchId)] : []),
        ...(branchId ? [or(eq(staffLeaveTypes.branchId, branchId), isNull(staffLeaveTypes.branchId))] : []),
        ...(staffId ? [eq(staffLeaveRequests.staffId, staffId)] : []),
        ...(leaveTypeId ? [eq(staffLeaveRequests.leaveTypeId, leaveTypeId)] : []),
        ...(leaveYear ? [eq(staffLeaveRequests.leaveYear, leaveYear)] : []),
        ...(requestStatus === "all" ? [] : [eq(staffLeaveRequests.status, requestStatus)]),
        ...(search ? [or(
          like(staffMembers.firstName, `%${search}%`),
          like(staffMembers.lastName, `%${search}%`),
          like(staffLeaveTypes.name, `%${search}%`),
        )!] : []),
      ))
      .orderBy(desc(staffLeaveRequests.createdAt))
      .limit(100),
  ]);
  const staffOptions = staff.map((member) => ({
    value: String(member.id),
    label: `${member.firstName} ${member.lastName}`,
  }));
  const leaveTypeOptions = types.map((type) => ({ value: String(type.id), label: type.name }));
  const currentLeaveYear = new Date().getFullYear();
  const pendingRequestCount = Number(requestCounts.find((item) => item.status === "pending")?.total ?? 0);
  const approvedRequestCount = Number(requestCounts.find((item) => item.status === "approved")?.total ?? 0);
  const rejectedRequestCount = Number(requestCounts.find((item) => item.status === "rejected")?.total ?? 0);
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
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Leave overview</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Define leave types and calendar-day entitlements, then submit and review requests.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/portal/staff/leave" className="inline-flex items-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Open staff leave page</Link>
          <Link href="/admin/hr/leave?requestStatus=pending" className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Pending leave requests</Link>
        </div>
      </header>

      <section aria-label="Leave overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LeaveMetric label="Pending requests" value={pendingRequestCount} tone="amber" />
        <LeaveMetric label="Approved requests" value={approvedRequestCount} tone="emerald" />
        <LeaveMetric label="Rejected requests" value={rejectedRequestCount} tone="rose" />
        <LeaveMetric label="Leave types" value={types.length} tone="violet" />
      </section>

      <SmartFilterForm method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <SearchableSelect
          label="Branch"
          name="branchId"
          options={[
            { value: "", label: "All branches" },
            ...branches.map((item) => ({ value: String(item.id), label: `${item.name} (${item.code})` })),
          ]}
          defaultValue={branchId?.toString() ?? ""}
          placeholder="Search branches..."
          disabled={!branches.length}
        />
      </SmartFilterForm>

      <SmartFilterForm method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {branchId && <input type="hidden" name="branchId" value={branchId} />}
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Search staff or leave type
          <input type="search" name="search" maxLength={120} defaultValue={search} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <SearchableSelect
          label="Staff member"
          name="staffId"
          options={[
            { value: "", label: "All staff" },
            ...staff.map((member) => ({ value: String(member.id), label: `${member.firstName} ${member.lastName}` })),
          ]}
          defaultValue={staffId?.toString() ?? ""}
          placeholder="Search staff..."
        />
        <SearchableSelect
          label="Leave type"
          name="leaveTypeId"
          options={[
            { value: "", label: "All leave types" },
            ...types.map((type) => ({ value: String(type.id), label: type.name })),
          ]}
          defaultValue={leaveTypeId?.toString() ?? ""}
          placeholder="Search leave types..."
        />
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Year
          <input type="number" name="year" min="2000" max="9999" defaultValue={leaveYear ?? ""} className="block w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Request status
          <select name="requestStatus" defaultValue={requestStatus} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      </SmartFilterForm>

      {!branches.length && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Create an active branch before managing leave.</p>}
      {branches.length > 0 && !branch && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Select a branch to manage leave.</p>}
      {branch && (
        <section className="grid gap-5 lg:grid-cols-3">
          <LeaveTypeForm branches={branches} branchId={branch.id} />
          <LeaveBalanceForm branchId={branch.id} branchName={branchName} staffOptions={staffOptions} leaveTypeOptions={leaveTypeOptions} leaveYear={currentLeaveYear} />
          <LeaveRequestForm branchId={branch.id} branchName={branchName} staffOptions={staffOptions} leaveTypeOptions={leaveTypeOptions} />
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Leave types</h2>
          <p className="mt-1 text-sm text-slate-500">Leave types available to each branch. Types without a branch apply school-wide.</p>
        </div>
        {types.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Leave type</th><th className="px-5 py-3">Branch scope</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {types.map((type) => <tr key={type.id}><td className="px-5 py-3 font-medium text-slate-800">{type.name}</td><td className="px-5 py-3 text-slate-600">{type.branchName ?? "All branches"}</td></tr>)}
            </tbody>
          </table>
        </div> : <p className="p-6 text-sm text-slate-500">No leave types are defined yet. Add a leave type above.</p>}
      </section>

      <section id="leave-entitlements-report" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Leave entitlements</h2>
              <p className="mt-1 text-sm text-slate-500">Entitlements are assigned per staff member, leave type, and calendar year.</p>
            </div>
            <div className="print:hidden flex flex-wrap gap-2">
              <PrintButton targetId="leave-entitlements-report" label="Print entitlement report" pageOrientation="landscape" />
              <DownloadCsv
                fileName={`leave-entitlements-${leaveYear ?? "all-years"}.csv`}
                headers={["Staff member", "Leave type", "Year", "Entitled days", "Approved days", "Pending days", "Available days"]}
                rows={balances.map((balance) => {
                  const key = `${balance.staffId}:${balance.leaveTypeId}:${balance.leaveYear}`;
                  const entitlement = Number(balance.entitlementDays);
                  const approved = usedDays.get(key) ?? 0;
                  const pending = pendingDays.get(key) ?? 0;
                  return [`${balance.staffName} ${balance.staffLastName}`, balance.leaveTypeName, balance.leaveYear, entitlement, approved, pending, Math.max(0, entitlement - approved - pending)];
                })}
              />
            </div>
          </div>
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

      <section id="leave-requests-report" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Leave requests</h2>
              <p className="mt-1 text-sm text-slate-500">Showing the latest 100 matching requests.</p>
            </div>
            <div className="print:hidden flex flex-wrap gap-2">
              <PrintButton targetId="leave-requests-report" label="Print leave report" pageOrientation="landscape" />
              <DownloadCsv
                fileName={`leave-requests-${leaveYear ?? "all-years"}.csv`}
                headers={["Staff member", "Leave type", "Start date", "End date", "Days", "Year", "Reason", "Status", "Review note"]}
                rows={requests.map((request) => [
                  `${request.staffName} ${request.staffLastName}`,
                  request.leaveTypeName,
                  request.startDate,
                  request.endDate,
                  request.requestedDays,
                  request.leaveYear,
                  request.reason,
                  request.status,
                  request.reviewNote ?? "",
                ])}
              />
            </div>
          </div>
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
                {request.status === "pending" && <div className="print:hidden"><LeaveReviewForm publicId={request.publicId} /></div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function parsePositiveId(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function LeaveMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "rose" | "violet";
}) {
  const styles = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
  }[tone];
  return <article className={`rounded-2xl border p-4 ${styles}`}>
    <p className="text-sm font-semibold">{label}</p>
    <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
  </article>;
}
