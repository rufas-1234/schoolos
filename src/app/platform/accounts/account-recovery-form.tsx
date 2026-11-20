"use client";

import { useActionState, useEffect, useRef } from "react";
import { updatePlatformAccountCredentials, type PlatformAccountRecoveryState } from "./actions";

const initialState: PlatformAccountRecoveryState = {};

export function AccountRecoveryForm({
  userId,
  name,
  email,
}: {
  userId: string;
  name: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(updatePlatformAccountCredentials, initialState);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.success && !state.error) return;
    if (passwordRef.current) passwordRef.current.value = "";
    if (confirmationRef.current) confirmationRef.current.value = "";
  }, [state.error, state.success]);

  return (
    <form action={action} className="min-w-72 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm font-semibold text-slate-900">{name}</p>
      <label className="block text-xs font-medium text-slate-600">
        Login email
        <input
          required
          type="email"
          name="email"
          defaultValue={email}
          maxLength={320}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900"
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Temporary password <span className="font-normal">(optional)</span>
        <input
          ref={passwordRef}
          type="password"
          name="password"
          autoComplete="new-password"
          maxLength={128}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900"
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Confirm password
        <input
          ref={confirmationRef}
          type="password"
          name="passwordConfirmation"
          autoComplete="new-password"
          maxLength={128}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900"
        />
      </label>
      {state.error && <p role="alert" className="text-xs font-medium text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="text-xs font-medium text-emerald-700">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving..." : "Update account"}
      </button>
    </form>
  );
}
