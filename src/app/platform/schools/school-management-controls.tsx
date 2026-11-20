"use client";

import { useActionState } from "react";
import {
  archiveSchool,
  reviewSchool,
  updateSchool,
  type SchoolManagementState,
} from "./management-actions";
import { canReopenSchoolReview } from "@/lib/school-lifecycle-policy";

const fieldClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

type SchoolManagementControlsProps = {
  schoolPublicId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  archived: boolean;
};

function ActionMessage({ state }: { state: SchoolManagementState }) {
  if (state.error) return <p role="alert" className="text-xs text-rose-700">{state.error}</p>;
  if (state.success) return <p role="status" className="text-xs text-emerald-700">{state.success}</p>;
  return null;
}

export function SchoolManagementControls({
  schoolPublicId,
  name,
  email,
  phone,
  address,
  status,
  archived,
}: SchoolManagementControlsProps) {
  const [reviewState, reviewAction, reviewPending] = useActionState<SchoolManagementState, FormData>(reviewSchool, {});
  const [editState, editAction, editPending] = useActionState<SchoolManagementState, FormData>(updateSchool, {});
  const [archiveState, archiveAction, archivePending] = useActionState<SchoolManagementState, FormData>(archiveSchool, {});
  const canReview = !archived && (status === "pending" || status === "rejected" || canReopenSchoolReview(status));

  return (
    <div className="w-full space-y-3">
      {canReview && (
        <form action={reviewAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="schoolPublicId" value={schoolPublicId} />
          {(status === "pending" || status === "rejected") && (
            <button
              type="submit"
              name="decision"
              value="approve"
              disabled={reviewPending}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {reviewPending ? "Saving…" : "Approve"}
            </button>
          )}
          {status === "pending" && (
            <button
              type="submit"
              name="decision"
              value="reject"
              disabled={reviewPending}
              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              Reject
            </button>
          )}
          {canReopenSchoolReview(status) && (
            <button
              type="submit"
              name="decision"
              value="pending"
              disabled={reviewPending}
              onClick={(event) => {
                if (!window.confirm(`Return ${name} to pending review? Members will lose access until it is approved again.`)) {
                  event.preventDefault();
                }
              }}
              className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
            >
              Require review
            </button>
          )}
        </form>
      )}
      <ActionMessage state={reviewState} />

      <details className="rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Edit school</summary>
        <form action={editAction} className="mt-3 space-y-3">
          <input type="hidden" name="schoolPublicId" value={schoolPublicId} />
          <label className="block space-y-1 text-xs font-medium text-slate-600">
            School name
            <input name="schoolName" required minLength={2} maxLength={255} defaultValue={name} className={fieldClass} />
          </label>
          <label className="block space-y-1 text-xs font-medium text-slate-600">
            School email
            <input name="schoolEmail" type="email" maxLength={320} defaultValue={email ?? ""} className={fieldClass} />
          </label>
          <label className="block space-y-1 text-xs font-medium text-slate-600">
            Phone
            <input name="schoolPhone" maxLength={40} defaultValue={phone ?? ""} className={fieldClass} />
          </label>
          <label className="block space-y-1 text-xs font-medium text-slate-600">
            Address
            <textarea name="schoolAddress" rows={2} maxLength={1000} defaultValue={address ?? ""} className={fieldClass} />
          </label>
          <button
            type="submit"
            disabled={editPending}
            className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
          >
            {editPending ? "Saving…" : "Save details"}
          </button>
          <ActionMessage state={editState} />
        </form>
      </details>

      <form
        action={archiveAction}
        onSubmit={(event) => {
          if (!archived && !window.confirm(`Archive ${name}? Members will lose access, but school data will be preserved and can be restored.`)) {
            event.preventDefault();
          }
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="schoolPublicId" value={schoolPublicId} />
        {archived ? (
          <input type="hidden" name="decision" value="restore" />
        ) : (
          <input type="hidden" name="decision" value="archive" />
        )}
        <button
          type="submit"
          disabled={archivePending}
          className={archived
            ? "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            : "rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"}
        >
          {archivePending ? "Saving…" : archived ? "Restore school" : "Archive school"}
        </button>
        {!archived && <span className="text-xs text-slate-500">Preserves data; access is disabled.</span>}
        <ActionMessage state={archiveState} />
      </form>
    </div>
  );
}
