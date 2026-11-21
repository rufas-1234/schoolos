"use client";

import Link from "next/link";
import { useActionState, useEffect, useSyncExternalStore } from "react";
import { completeAccountPasswordSetup, type AccountSetupState } from "./actions";

const initialState: AccountSetupState = {};
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400";

function subscribeToSetupToken(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getSetupToken() {
  return window.location.hash.slice(1);
}

export function AccountSetupForm() {
  const [state, action, pending] = useActionState(completeAccountPasswordSetup, initialState);
  const token = useSyncExternalStore(subscribeToSetupToken, getSetupToken, () => "");

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  if (state.success) {
    return (
      <div className="space-y-3">
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          Password set. Sign-in is now enabled for your account.
        </p>
        <Link href="/login" className="inline-flex rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
          Continue to sign in
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
        This setup link is missing or invalid. Ask your school administrator for a new one.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        New password
        <input
          required
          minLength={6}
          maxLength={128}
          autoComplete="new-password"
          name="password"
          type="password"
          className={inputClass}
        />
        <span className="block text-xs font-normal text-slate-500">
          Use at least 6 characters with uppercase, lowercase, a number, and a symbol.
        </span>
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        Confirm password
        <input
          required
          minLength={6}
          maxLength={128}
          autoComplete="new-password"
          name="passwordConfirmation"
          type="password"
          className={inputClass}
        />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
      >
        {pending ? "Setting password..." : "Set password"}
      </button>
    </form>
  );
}
