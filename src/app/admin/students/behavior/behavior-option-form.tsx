"use client";

import { useActionState } from "react";
import { createBehaviorOption, type BehaviorActionState } from "../behavior-actions";

export function BehaviorOptionForm() {
  const [state, formAction, pending] = useActionState<BehaviorActionState, FormData>(createBehaviorOption, {});
  return <form action={formAction} className="space-y-4">
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">Option type
      <select name="kind" required defaultValue="category" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <option value="category">Behaviour category</option><option value="action">Action taken</option>
      </select>
    </label>
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">Name
      <input name="name" required minLength={2} maxLength={40} placeholder="For example, Leadership" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
    </label>
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
    <div className="flex justify-end"><button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">{pending ? "Saving..." : "Add option"}</button></div>
  </form>;
}
