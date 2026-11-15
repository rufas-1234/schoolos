"use client";

import { useState, useTransition } from "react";
import { saveStudentSettings, generateMissingStudentIdentifiers, type StudentSettingsActionState } from "./actions";
import { useActionState } from "react";
import type { StudentFieldSettings } from "@/db/schema";
import { studentSettingFields } from "@/lib/student-settings";

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

export function StudentSettingsForm({
  admissionFormat,
  rollFormat,
  fields,
}: {
  admissionFormat: string;
  rollFormat: string;
  fields: StudentFieldSettings;
}) {
  const [state, formAction, pending] = useActionState<StudentSettingsActionState, FormData>(
    saveStudentSettings,
    {},
  );
  const [generation, setGeneration] = useState<StudentSettingsActionState>({});
  const [isGenerating, startGeneration] = useTransition();
  const groups = new Map<string, (typeof studentSettingFields)[number][]>();
  for (const field of studentSettingFields) {
    groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
  }

  function generate() {
    setGeneration({});
    startGeneration(async () => setGeneration(await generateMissingStudentIdentifiers()));
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Student Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Choose which student fields appear and are required. Admission and roll numbers are generated automatically.</p>
      </header>

      <form action={formAction} className="space-y-6">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="font-semibold text-slate-900">Automatic identifiers</h2>
            <p className="mt-1 text-sm text-slate-600">Use a sequence token in each format. Examples: <code>STU-{"{YY}"}-{"{SEQ:4}"}</code> and <code>{"{SEQ:3}"}</code>. Supported tokens: {"{SEQ}"}, {"{SEQ:n}"}, {"{YYYY}"}, {"{YY}"}, {"{MM}"}, {"{DD}"}.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              Admission number format
              <input name="admissionFormat" required maxLength={40} defaultValue={admissionFormat} className={inputClass} />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              Roll number format
              <input name="rollFormat" required maxLength={40} defaultValue={rollFormat} className={inputClass} />
            </label>
          </div>
        </section>

        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="font-semibold text-slate-900">Student form fields</h2>
            <p className="mt-1 text-sm text-slate-600">Student names and the branch, academic year, class, and section required for admission placement cannot be disabled.</p>
          </div>
          {[...groups.entries()].map(([group, groupFields]) => (
            <fieldset key={group} className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-slate-800">{group}</legend>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {groupFields.map((field) => {
                  const setting = fields[field.name];
                  return (
                    <div key={field.name} className="grid items-center gap-3 px-3 py-2.5 sm:grid-cols-[1fr_auto_auto]">
                      <span className="text-sm text-slate-700">{field.label}{field.locked ? " (always required)" : ""}</span>
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          name={`enabled:${field.name}`}
                          defaultChecked={setting.enabled}
                          disabled={field.locked}
                          className="accent-violet-700"
                        />
                        Visible
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          name={`required:${field.name}`}
                          defaultChecked={setting.required}
                          disabled={field.locked}
                          className="accent-violet-700"
                        />
                        Required
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </section>

        {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
        {state.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
        <button type="submit" disabled={pending} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">
          {pending ? "Saving..." : "Save settings"}
        </button>
      </form>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-semibold text-slate-900">Generate identifiers for current students</h2>
          <p className="mt-1 text-sm text-slate-600">Fill missing admission numbers and roll numbers for currently enrolled students. Existing numbers are kept unchanged.</p>
        </div>
        {generation.error && <p role="alert" className="text-sm text-rose-700">{generation.error}</p>}
        {generation.success && <p role="status" className="text-sm text-emerald-700">{generation.success}</p>}
        <button type="button" onClick={generate} disabled={isGenerating} className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60">
          {isGenerating ? "Generating..." : "Generate missing identifiers"}
        </button>
      </section>
    </div>
  );
}
