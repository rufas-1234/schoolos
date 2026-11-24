"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changeTemporaryPassword, type AccountPasswordState } from "@/app/account/actions";

const initialState: AccountPasswordState = {};

export function FirstLoginPasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(changeTemporaryPassword, initialState);

  useEffect(() => {
    const destination = state.redirectTo;
    if (!destination) return;
    const timer = window.setTimeout(() => router.replace(destination), 650);
    return () => window.clearTimeout(timer);
  }, [router, state.redirectTo]);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="font-semibold text-slate-950">Choose your password</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Replace the temporary password your school gave you before continuing to your workspace.
        </p>
      </div>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Temporary password
        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-400 focus:bg-white"
        />
      </label>
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
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}
      <button
        type="submit"
        disabled={pending || Boolean(state.redirectTo)}
        className="inline-flex w-full items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-violet-400"
      >
        {pending ? "Updating password…" : state.redirectTo ? "Opening your account…" : "Set password and continue"}
      </button>
    </form>
  );
}
