"use client";

import { useActionState } from "react";
import { AdminActionDialog } from "@/components/admin-data-table";
import { AccountSetupLink } from "@/components/account-setup-link";
import { AccountTemporaryPassword } from "@/components/account-temporary-password";
import {
  approveAllPendingStaffApplications,
  reviewPublicStaffApplication,
  type StaffActionState,
} from "@/app/admin/staff/actions";

function ReviewDecisionForm({
  publicId,
  decision,
  label,
}: {
  publicId: string;
  decision: "approve" | "reject";
  label: string;
}) {
  const [state, formAction, pending] = useActionState<StaffActionState, FormData>(
    reviewPublicStaffApplication,
    {},
  );
  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="inline-flex">
        <input type="hidden" name="applicationPublicId" value={publicId} />
        <input type="hidden" name="decision" value={decision} />
        <button type="submit" disabled={pending}
          className={decision === "approve"
            ? "border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            : "border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"}>
          {pending ? "Saving..." : label}
        </button>
      </form>
      {state.error && <p role="alert" className="max-w-56 text-xs text-red-700">{state.error}</p>}
      {state.success && (
        <div className="max-w-72 space-y-2">
          <p role="status" className="break-words text-xs text-slate-600">
            {state.message ?? `Application ${decision === "approve" ? "approved" : "rejected"}.`}
          </p>
          {state.temporaryPassword && <AccountTemporaryPassword accountType="staff" username={state.temporaryUsername} password={state.temporaryPassword} />}
          {state.setupUrl && <AccountSetupLink url={state.setupUrl} />}
        </div>
      )}
    </div>
  );
}

export function StaffApplicationReviewActions({
  publicId,
  status,
  applicantName,
  details,
  canResume,
}: {
  publicId: string;
  status: string;
  applicantName: string;
  details: { label: string; value: string }[];
  canResume: boolean;
}) {
  const canApprove = status === "pending" || canResume;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AdminActionDialog label="View" title={`${applicantName} application`}>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {details.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{item.value}</dd>
            </div>
          ))}
        </dl>
        {canApprove && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <ReviewDecisionForm publicId={publicId} decision="approve"
              label={canResume ? "Resume approval" : "Approve and add to staff"} />
            {status === "pending" && <ReviewDecisionForm publicId={publicId} decision="reject" label="Reject application" />}
          </div>
        )}
      </AdminActionDialog>
      {canApprove && (
        <>
          <ReviewDecisionForm publicId={publicId} decision="approve" label={canResume ? "Resume" : "Approve"} />
          {status === "pending" && <ReviewDecisionForm publicId={publicId} decision="reject" label="Reject" />}
        </>
      )}
    </div>
  );
}

export function BulkStaffApplicationApprovalForm({ pendingCount }: { pendingCount: number }) {
  const [state, action, pending] = useActionState<StaffActionState, FormData>(
    approveAllPendingStaffApplications,
    {},
  );
  return (
    <div className="min-w-48 space-y-2">
      <form action={action} onSubmit={(event) => {
        if (!window.confirm(`Approve all ${pendingCount} pending staff applications and add those applicants to the staff directory?`)) {
          event.preventDefault();
        }
      }}>
        <button type="submit" disabled={pending || pendingCount === 0}
          className="inline-flex w-full items-center justify-center border border-emerald-700 bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Approving staff..." : `Approve all pending (${pendingCount})`}
        </button>
      </form>
      {state.message && <p role="status" className="max-w-80 text-xs text-slate-600">{state.message}</p>}
      {state.failures?.map((failure) => <p key={failure} role="alert" className="max-w-80 text-xs text-rose-700">{failure}</p>)}
      {state.temporaryCredentials?.length ? (
        <div className="space-y-2 border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-950">Share each staff number and temporary password privately. They must change the password at first sign-in.</p>
          {state.temporaryCredentials.map(({ applicantName, staffNumber, password }) => (
            <div key={staffNumber} className="space-y-1">
              <p className="text-xs font-medium text-amber-950">{applicantName}</p>
              <AccountTemporaryPassword accountType="staff" username={staffNumber} password={password} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
