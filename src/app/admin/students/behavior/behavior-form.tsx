"use client";

import { useActionState } from "react";
import { RequiredMark } from "@/components/required-mark";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";
import { createBehaviorRecord, updateBehaviorRecord, type BehaviorActionState } from "../behavior-actions";

const categories = ["positive", "classroom", "attendance", "uniform", "peer_conflict", "bullying", "property", "safety", "other"];
const actions = ["commendation", "counselling", "verbal_warning", "parent_contact", "detention", "suspension", "other"];
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export type BehaviorRecordFormData = {
  publicId: string;
  studentPublicId: string;
  incidentDate: string;
  category: string;
  severity: string;
  details: string;
  actionTaken: string;
  followUpDate: string | null;
};

export function BehaviorRecordForm({ students, record }: { students: SearchableSelectOption[]; record?: BehaviorRecordFormData }) {
  const [state, formAction, pending] = useActionState<BehaviorActionState, FormData>(
    record ? updateBehaviorRecord : createBehaviorRecord,
    {},
  );
  return (
    <form action={formAction} className="space-y-5">
      {record && <input type="hidden" name="publicId" value={record.publicId} />}
      <p className="text-xs text-slate-500"><RequiredMark /> Required fields</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SearchableSelect label="Student" name="studentPublicId" options={students} required defaultValue={record?.studentPublicId} placeholder="Search by student name or admission number..." disabled={!students.length} />
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">Incident date <RequiredMark />
          <input type="date" name="incidentDate" required defaultValue={record?.incidentDate ?? new Date().toISOString().slice(0, 10)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">Category <RequiredMark />
          <select name="category" required defaultValue={record?.category ?? "classroom"} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900">{categories.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">Severity <RequiredMark />
          <select name="severity" required defaultValue={record?.severity ?? "low"} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900">{["positive", "low", "moderate", "serious"].map((item) => <option key={item} value={item}>{title(item)}</option>)}</select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">Details <RequiredMark />
          <textarea name="details" required minLength={4} maxLength={3000} rows={4} defaultValue={record?.details ?? ""} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" placeholder="Describe the behaviour and relevant context." />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">Action taken <RequiredMark />
          <select name="actionTaken" required defaultValue={record?.actionTaken ?? "counselling"} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900">{actions.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">Follow-up date
          <input type="date" name="followUpDate" defaultValue={record?.followUpDate ?? ""} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
        </label>
      </div>
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
      <div className="flex justify-end"><button type="submit" disabled={pending || !students.length} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">{pending ? "Saving..." : record ? "Save changes" : "Add record"}</button></div>
    </form>
  );
}
