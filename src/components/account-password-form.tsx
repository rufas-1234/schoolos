"use client";

import { useActionState } from "react";
import { changeAccountPassword, type AccountPasswordState } from "@/app/account/actions";

const initialState: AccountPasswordState = {};

export function AccountPasswordForm() {
  const [state, formAction, pending] = useActionState(changeAccountPassword, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="font-semibold text-slate-950">Change your password</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Use 6+ characters with uppercase, lowercase, a number, and a symbol. Common or repeated passwords are rejected.
        </p>
      </div>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Current password
        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          New password
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            minLength={6}
            maxLength={128}
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Confirm new password
          <input
            type="password"
            name="passwordConfirmation"
            autoComplete="new-password"
            minLength={6}
            maxLength={128}
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
          />
        </label>
      </div>
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-violet-400 sm:w-auto"
      >
        {pending ? "Updating password..." : "Update password"}
      </button>
    </form>
  );
}
