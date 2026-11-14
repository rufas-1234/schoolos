"use client";

import { useActionState } from "react";
import {
  createStaffCatalogEntry,
  deleteStaffCatalogEntry,
  updateStaffCatalogEntry,
  type HrCatalogActionState,
  type HrCatalogKind,
} from "./catalog-actions";

const fieldClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white";

export function CreateCatalogEntryForm({ kind }: { kind: HrCatalogKind }) {
  const [state, action, pending] = useActionState(createStaffCatalogEntry, {});
  const label = kind === "department" ? "department" : "designation";
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="kind" value={kind} />
      <h2 className="font-semibold text-slate-900">Add {label}</h2>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Name
        <input name="name" required minLength={2} maxLength={120} className={fieldClass} />
      </label>
      <ActionFeedback state={state} />
      <button disabled={pending} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
        {pending ? "Saving..." : `Add ${label}`}
      </button>
    </form>
  );
}

export function CatalogEntryForm({
  id,
  kind,
  name,
  staffCount,
}: {
  id: number;
  kind: HrCatalogKind;
  name: string;
  staffCount: number;
}) {
  const [state, action, pending] = useActionState(updateStaffCatalogEntry, {});
  const [deleteState, deleteAction, deleting] = useActionState(deleteStaffCatalogEntry, {});
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{name}</p>
        <p className="mt-1 text-xs text-slate-500">{staffCount} staff member{staffCount === 1 ? "" : "s"}</p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <form action={action} className="flex gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="kind" value={kind} />
          <label className="sr-only" htmlFor={`${kind}-${id}-name`}>Rename {name}</label>
          <input
            id={`${kind}-${id}-name`}
            name="name"
            defaultValue={name}
            required
            minLength={2}
            maxLength={120}
            className="w-44 rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
          />
          <button disabled={pending} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {pending ? "Saving..." : "Rename"}
          </button>
        </form>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="kind" value={kind} />
          <button disabled={deleting} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </form>
      </div>
      <div className="basis-full">
        <ActionFeedback state={state} />
        <ActionFeedback state={deleteState} />
      </div>
    </div>
  );
}

function ActionFeedback({ state }: { state: HrCatalogActionState }) {
  if (state.error) return <p role="alert" className="text-xs text-rose-600">{state.error}</p>;
  if (state.success) return <p role="status" className="text-xs text-emerald-700">Saved successfully.</p>;
  return null;
}
