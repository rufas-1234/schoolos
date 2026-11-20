"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequiredMark } from "@/components/required-mark";
import {
  createSchoolCurrency,
  setDefaultSchoolCurrency,
  updateSchoolProfile,
  type ProfileActionState,
} from "./actions";

type SchoolProfile = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  timezone: string;
};

export type SchoolCurrencyOption = {
  code: string;
  name: string;
  symbol: string;
  isDefault: boolean;
};

export function SchoolSettingsForm({
  school,
  currencies,
}: {
  school: SchoolProfile;
  currencies: SchoolCurrencyOption[];
}) {
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
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">
            Default currency <RequiredMark />
          </span>
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            defaultValue={school.currency}
            name="currency"
            required
          >
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} - {currency.name} ({currency.symbol})
              </option>
            ))}
          </select>
        </label>
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

export function SchoolCurrencySettings({ currencies }: { currencies: SchoolCurrencyOption[] }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">School currencies</h2>
        <p className="mt-1 text-sm text-slate-500">
          Add currencies used for fees and accounts. Balances stay in their original currency; no exchange conversion is applied.
        </p>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
        {currencies.map((currency) => (
          <li key={currency.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">
                {currency.code} <span className="font-normal text-slate-500">· {currency.name}</span>
              </p>
              <p className="text-xs text-slate-500">Symbol: {currency.symbol}</p>
            </div>
            {currency.isDefault
              ? <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">Default</span>
              : <SetDefaultCurrencyForm code={currency.code} />}
          </li>
        ))}
      </ul>
      <CreateCurrencyForm />
    </div>
  );
}

function SetDefaultCurrencyForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(
    setDefaultSchoolCurrency,
    {},
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="code" value={code} />
      {state.error && <span role="alert" className="text-xs text-rose-700">{state.error}</span>}
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        {pending ? "Saving..." : "Make default"}
      </Button>
    </form>
  );
}

function CreateCurrencyForm() {
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(
    createSchoolCurrency,
    {},
  );
  return (
    <form action={action} className="space-y-4 rounded-xl bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Add a currency</h3>
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">Currency added.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="ISO code" name="code" required defaultValue="" />
        <Field label="Currency name" name="name" required defaultValue="" />
        <Field label="Symbol" name="symbol" required defaultValue="" />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input className="size-4 accent-violet-600" name="makeDefault" type="checkbox" />
        Make this the default currency
      </label>
      <Button disabled={pending} type="submit">
        {pending ? "Adding..." : "Add currency"}
      </Button>
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
