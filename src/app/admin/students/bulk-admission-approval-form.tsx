"use client";

import { useActionState } from "react";
import { AccountTemporaryPassword } from "@/components/account-temporary-password";
import { approveAllPendingAdmissions, type StudentActionState } from "./actions";

export function BulkAdmissionApprovalForm({ pendingCount }: { pendingCount: number }) {
  const [state, action, pending] = useActionState<StudentActionState, FormData>(approveAllPendingAdmissions, {});

  return (
    <div className="min-w-48 space-y-2">
      <form action={action} onSubmit={(event) => {
        if (!window.confirm(`Approve all ${pendingCount} pending student applications? This will enroll the students and create their portal access.`)) {
          event.preventDefault();
        }
      }}>
        <button type="submit" disabled={pending || pendingCount === 0}
          className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Approving students..." : `Approve all pending (${pendingCount})`}
        </button>
      </form>
      {state.message && <p role="status" className="max-w-80 text-xs text-slate-600">{state.message}</p>}
      {state.failures?.map((failure) => <p key={failure} role="alert" className="max-w-80 text-xs text-rose-700">{failure}</p>)}
      {state.temporaryCredentials?.length ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-950">Share each admission number and temporary password privately. Students must change their passwords at first sign-in.</p>
          {state.temporaryCredentials.map((credential) => (
            <AccountTemporaryPassword key={credential.admissionNumber} username={credential.admissionNumber} password={credential.password} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
