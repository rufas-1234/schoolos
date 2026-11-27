"use client";

import { useActionState } from "react";
import { createTransportRecord, type TransportActionState } from "./actions";

export type TransportField = { name: string; label: string; options?: { value: string; label: string }[]; type?: "text" | "number" | "time"; required?: boolean; placeholder?: string; defaultValue?: string };

export function TransportRecordForm({ kind, fields }: { kind: string; fields: TransportField[] }) {
  const [state, action, pending] = useActionState<TransportActionState, FormData>(createTransportRecord, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="kind" value={kind} />
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => <label key={field.name} className="space-y-1.5 text-sm font-medium text-slate-700">
        {field.label}
        {field.options ? <select name={field.name} required={field.required !== false} defaultValue="" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3">
          <option value="">Select {field.label.toLocaleLowerCase()}</option>
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <input name={field.name} type={field.type ?? "text"} required={field.required !== false} defaultValue={field.defaultValue} min={field.type === "number" ? "1" : undefined} step={field.name === "amount" ? "0.01" : undefined} maxLength={field.type ? undefined : 500} placeholder={field.placeholder} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" />}
      </label>)}
    </div>
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
    <button disabled={pending} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : "Save"}</button>
  </form>;
}
