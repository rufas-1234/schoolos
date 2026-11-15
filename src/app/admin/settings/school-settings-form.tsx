"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequiredMark } from "@/components/required-mark";
import { updateSchoolProfile, type ProfileActionState } from "./actions";

type SchoolProfile = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  timezone: string;
};

export function SchoolSettingsForm({ school }: { school: SchoolProfile }) {
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(
    updateSchoolProfile,
    {},
  );

  return (
    <form action={action} className="space-y-6">
      <p className="text-xs text-slate-500">
        <RequiredMark /> Required fields
      </p>
      {state.error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={17} />
          School profile saved.
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="School name" name="name" required defaultValue={school.name} />
        <Field label="School email" name="email" type="email" defaultValue={school.email ?? ""} />
        <Field label="Telephone" name="phone" defaultValue={school.phone ?? ""} />
        <Field label="Currency (ISO 4217)" name="currency" required defaultValue={school.currency} />
        <Field label="Timezone" name="timezone" required defaultValue={school.timezone} />
        <label className="block sm:col-span-2">
          <span className="mb-2 block text-sm font-medium text-slate-700">Address</span>
          <textarea
            className="min-h-24 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            defaultValue={school.address ?? ""}
            name="address"
            maxLength={1000}
          />
        </label>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">Changes are saved to your school&apos;s TiDB database.</p>
        <Button disabled={pending} type="submit">
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label} {required && <RequiredMark />}
      </span>
      <input
        className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
        defaultValue={defaultValue}
        maxLength={name === "phone" ? 40 : name === "logoUrl" ? 2048 : undefined}
        name={name}
        required={required}
        type={name === "logoUrl" ? "url" : type}
      />
    </label>
  );
}
