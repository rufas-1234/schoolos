"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupSchool, type SchoolSignupState } from "./actions";

const fieldClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100";

export function SchoolSignupForm() {
  const [state, action, pending] = useActionState<SchoolSignupState, FormData>(signupSchool, {});

  if (state.success) {
    return (
      <div role="status" className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="font-semibold text-emerald-950">School workspace created</h2>
        <p className="mt-2 text-sm leading-6 text-emerald-900">{state.success}</p>
        <Link
          href="/login"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white transition hover:bg-violet-800"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-7 space-y-5">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-800">School details</h2>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          School name
          <input name="schoolName" required minLength={2} maxLength={255} autoComplete="organization" className={fieldClass} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            School email (optional)
            <input name="schoolEmail" type="email" maxLength={320} autoComplete="email" className={fieldClass} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            School phone (optional)
            <input name="schoolPhone" type="tel" maxLength={40} autoComplete="tel" className={fieldClass} />
          </label>
        </div>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          School address (optional)
          <textarea name="schoolAddress" rows={2} maxLength={1000} autoComplete="street-address" className={`${fieldClass} h-auto py-3`} />
        </label>
      </section>

      <section className="space-y-4 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-800">Administrator details</h2>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Administrator name
          <input name="adminName" required minLength={2} maxLength={255} autoComplete="name" className={fieldClass} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Administrator email
          <input name="adminEmail" type="email" required maxLength={320} autoComplete="email" className={fieldClass} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Password
            <input name="password" type="password" required maxLength={128} autoComplete="new-password" className={fieldClass} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Confirm password
            <input name="passwordConfirmation" type="password" required maxLength={128} autoComplete="new-password" className={fieldClass} />
          </label>
        </div>
      </section>

      {state.error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating your school…" : "Create school workspace"}
      </button>
      <p className="text-center text-xs leading-5 text-slate-500">
        Email verification is not enabled yet.
      </p>
    </form>
  );
}
