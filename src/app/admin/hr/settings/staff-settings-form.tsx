"use client";

import { useActionState } from "react";
import { saveStaffSettings } from "./actions";
import type { StaffSettingsActionState } from "./actions";
import { staffSettingFields } from "@/lib/staff-settings";

export function StaffSettingsForm({ requiredFields }: { requiredFields: string[] }) {
  const [state, formAction, pending] = useActionState<StaffSettingsActionState, FormData>(
    saveStaffSettings,
    {},
  );
  const groups = new Map<string, (typeof staffSettingFields)[number][]>();
  for (const field of staffSettingFields) {
    groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">Human resources</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">HR settings</h1>
        <p className="mt-2 text-sm text-slate-500">Choose which staff profile fields must be completed when adding or editing a staff member.</p>
      </header>
      <form action={formAction} className="space-y-5">
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">Branch, first name, last name, designation, department, and employment type remain required for every staff record.</p>
          {[...groups.entries()].map(([group, fields]) => (
            <fieldset key={group} className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-slate-800">{group}</legend>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {fields.map((field) => (
                  <label key={field.name} className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm text-slate-700">
                    <span>{field.label}{field.locked ? " (always required)" : ""}</span>
                    <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        name="requiredFields"
                        value={field.name}
                        defaultChecked={requiredFields.includes(field.name)}
                        disabled={field.locked}
                        className="accent-violet-700"
                      />
                      Required
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>
        {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
        {state.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
        <button type="submit" disabled={pending} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">
          {pending ? "Saving..." : "Save HR settings"}
        </button>
      </form>
    </div>
  );
}
