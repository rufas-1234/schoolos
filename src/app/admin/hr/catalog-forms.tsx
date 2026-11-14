"use client";

import { Building2 } from "lucide-react";
import { useActionState } from "react";
import { AdminRecordDialog } from "@/components/admin-data-table";
import {
  createStaffCatalogEntry,
  deleteStaffCatalogEntry,
  updateStaffCatalogEntry,
  type HrCatalogActionState,
  type HrCatalogKind,
} from "./catalog-actions";

const fieldClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white";

type BranchOption = { id: number; name: string; code: string };

export function CreateCatalogEntryForm({
  kind,
  branches,
}: {
  kind: HrCatalogKind;
  branches: BranchOption[];
}) {
  const [state, action, pending] = useActionState(createStaffCatalogEntry, {});
  const label = kind === "department" ? "department" : "designation";
  return (
    <form action={action} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="kind" value={kind} />
      <div>
        <h2 className="font-semibold text-slate-900">Add {label}</h2>
        <p className="mt-1 text-sm text-slate-500">Choose the branch this {label} belongs to.</p>
      </div>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Branch
        <select name="branchId" required defaultValue="" className={fieldClass}>
          <option value="" disabled>Select a branch</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Name
        <input name="name" required minLength={2} maxLength={120} className={fieldClass} />
      </label>
      {!branches.length && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Create an active branch before adding {label}s.</p>
      )}
      <ActionFeedback state={state} />
      <button
        disabled={pending || !branches.length}
        className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
      >
        {pending ? "Saving..." : `Add ${label}`}
      </button>
    </form>
  );
}

export function CatalogEntryForm({
  id,
  kind,
  name,
  branchName,
  branchCode,
  staffCount,
}: {
  id: number;
  kind: HrCatalogKind;
  name: string;
  branchName: string | null;
  branchCode: string | null;
  staffCount: number;
}) {
  const [state, action, pending] = useActionState(updateStaffCatalogEntry, {});
  const [deleteState, deleteAction, deleting] = useActionState(deleteStaffCatalogEntry, {});
  const label = kind === "department" ? "department" : "designation";

  return (
    <li className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          <Building2 size={18} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {branchName ? `${branchName}${branchCode ? ` (${branchCode})` : ""}` : "All branches · legacy"}
            {" · "}
            {staffCount} staff member{staffCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <AdminRecordDialog title={`Edit ${name}`}>
          <form action={action} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="kind" value={kind} />
            <label className="block space-y-1.5 text-sm font-medium text-slate-700">
              {label} name
              <input
                name="name"
                defaultValue={name}
                required
                minLength={2}
                maxLength={120}
                className={fieldClass}
              />
            </label>
            <p className="text-sm text-slate-500">
              Branch: {branchName ? `${branchName}${branchCode ? ` (${branchCode})` : ""}` : "All branches · legacy"}
            </p>
            <ActionFeedback state={state} />
            <button disabled={pending} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
              {pending ? "Saving..." : "Save changes"}
            </button>
          </form>
        </AdminRecordDialog>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="kind" value={kind} />
          <button
            disabled={deleting}
            onClick={(event) => {
              if (!window.confirm(`Delete ${name}? Staff members assigned to it must be changed first.`)) {
                event.preventDefault();
              }
            }}
            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </form>
      </div>
      <div className="sm:col-span-2">
        <ActionFeedback state={state} />
        <ActionFeedback state={deleteState} />
      </div>
    </li>
  );
}

function ActionFeedback({ state }: { state: HrCatalogActionState }) {
  if (state.error) return <p role="alert" className="text-sm text-rose-600">{state.error}</p>;
  if (state.success) return <p role="status" className="text-sm text-emerald-700">Saved successfully.</p>;
  return null;
}
