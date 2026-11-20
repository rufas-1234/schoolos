"use client";

import { useActionState, useState } from "react";
import { saveStaffSettings } from "./actions";
import type { StaffSettingsActionState } from "./actions";
import { staffSettingFields } from "@/lib/staff-settings";

export function StaffSettingsForm({
  requiredFields,
  visibleFields,
}: {
  requiredFields: string[];
  visibleFields: string[];
}) {
  const [state, formAction, pending] = useActionState<StaffSettingsActionState, FormData>(
    saveStaffSettings,
    {},
  );
  const [required, setRequired] = useState(() => new Set(requiredFields));
  const [visible, setVisible] = useState(() => new Set(visibleFields));
  const [fieldSearch, setFieldSearch] = useState("");
  const groups = new Map<string, (typeof staffSettingFields)[number][]>();
  for (const field of staffSettingFields) {
    groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
  }
  const normalizedSearch = fieldSearch.trim().toLocaleLowerCase();
  const matchesSearch = (label: string, group: string) =>
    !normalizedSearch || `${label} ${group}`.toLocaleLowerCase().includes(normalizedSearch);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">Human resources</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">HR settings</h1>
        <p className="mt-2 text-sm text-slate-500">Choose which staff profile fields appear on staff forms and which visible fields must be completed.</p>
      </header>
      <form action={formAction} className="space-y-5">
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">Branch, name, designation, department, and employment type are always required.</p>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Find a field
            <input
              type="search"
              value={fieldSearch}
              onChange={(event) => setFieldSearch(event.target.value)}
              placeholder="Search staff profile fields"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-violet-400"
            />
          </label>
          {[...groups.entries()].map(([group, fields]) => (
            <fieldset key={group} hidden={!fields.some((field) => matchesSearch(field.label, group))} className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-slate-800">{group}</legend>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {fields.map((field) => (
                  <label key={field.name} hidden={!matchesSearch(field.label, group)} className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm text-slate-700">
                    <span>{field.label}{field.locked ? " (always required)" : ""}</span>
                    <span className="flex items-center gap-4 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="visibleFields"
                          value={field.name}
                          checked={visible.has(field.name)}
                          onChange={(event) => {
                            setVisible((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(field.name);
                              else next.delete(field.name);
                              return next;
                            });
                            if (!event.target.checked) {
                              setRequired((current) => {
                                const next = new Set(current);
                                next.delete(field.name);
                                return next;
                              });
                            }
                          }}
                          disabled={field.locked}
                          className="accent-violet-700"
                        />
                        Show
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="requiredFields"
                          value={field.name}
                          checked={required.has(field.name)}
                          onChange={(event) => {
                            setRequired((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(field.name);
                              else next.delete(field.name);
                              return next;
                            });
                          }}
                          disabled={field.locked || !visible.has(field.name)}
                          className="accent-violet-700"
                        />
                        Required
                      </span>
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
