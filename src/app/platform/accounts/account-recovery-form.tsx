"use client";

import { useActionState, useEffect, useRef } from "react";
import { AccountSetupLink } from "@/components/account-setup-link";
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
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success) return;
    const setupField = formRef.current?.elements.namedItem("issuePasswordSetup");
    if (setupField instanceof HTMLInputElement) setupField.checked = false;
  }, [state.setupUrl, state.success]);

  return (
    <form ref={formRef} action={action} className="min-w-72 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
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
      <label className="flex items-start gap-2 text-xs font-medium text-slate-600">
        <input type="checkbox" name="issuePasswordSetup" value="true" className="mt-0.5 accent-violet-700" />
        <span>
          Issue a one-time password setup link
          <span className="mt-1 block font-normal leading-5">
            Sign-in is disabled until the recipient sets a password. All current sessions are revoked.
          </span>
        </span>
      </label>
      {state.error && <p role="alert" className="text-xs font-medium text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="text-xs font-medium text-emerald-700">{state.success}</p>}
      {state.setupUrl && <AccountSetupLink url={state.setupUrl} />}
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
