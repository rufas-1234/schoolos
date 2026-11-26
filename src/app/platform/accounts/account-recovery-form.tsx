"use client";

import { useActionState, useEffect, useRef } from "react";
import { AccountSetupLink } from "@/components/account-setup-link";
import { updatePlatformAccountCredentials, type PlatformAccountRecoveryState } from "./actions";

const initialState: PlatformAccountRecoveryState = {};

export function AccountRecoveryForm({
  userId,
  name,
  email,
  standardIdentifiers,
}: {
  userId: string;
  name: string;
  email: string;
  standardIdentifiers: { id: number; kind: string; identifier: string }[];
}) {
  const [state, action, pending] = useActionState(updatePlatformAccountCredentials, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success && !state.error) return;
    const passwordField = formRef.current?.elements.namedItem("password");
    const confirmationField = formRef.current?.elements.namedItem("passwordConfirmation");
    if (passwordField instanceof HTMLInputElement) passwordField.value = "";
    if (confirmationField instanceof HTMLInputElement) confirmationField.value = "";
    if (state.success) {
      const setupField = formRef.current?.elements.namedItem("issuePasswordSetup");
      const standardLoginField = formRef.current?.elements.namedItem("standardLoginIdentifierId");
      if (setupField instanceof HTMLInputElement) setupField.checked = false;
      if (standardLoginField instanceof HTMLSelectElement) standardLoginField.value = "";
    }
  }, [state.error, state.setupUrl, state.success]);

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
      <label className="block text-xs font-medium text-slate-600">
        Reset to the standard student/staff password <span className="font-normal">(optional)</span>
        <select
          name="standardLoginIdentifierId"
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900"
        >
          <option value="">Choose a linked student or staff number</option>
          {standardIdentifiers.map((identifier) => (
            <option key={identifier.id} value={identifier.id}>
              {identifier.kind === "student_admission" ? "Student · Admission number" : "Staff · Staff number"}: {identifier.identifier}
            </option>
          ))}
        </select>
        <span className="mt-1 block font-normal leading-5">
          Students use the admission number with password Student@admission-number. Staff use the staff number with password Staff@staff-number.
        </span>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Temporary password <span className="font-normal">(optional)</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          maxLength={128}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900"
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Confirm temporary password
        <input
          type="password"
          name="passwordConfirmation"
          autoComplete="new-password"
          maxLength={128}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900"
        />
      </label>
      <p className="text-xs leading-5 text-slate-500">
        A temporary password requires the recipient to change it before opening the school workspace. Share it securely; it is never shown in the result message.
      </p>
      <label className="flex items-start gap-2 text-xs font-medium text-slate-600">
        <input type="checkbox" name="issuePasswordSetup" value="true" className="mt-0.5 accent-violet-700" />
        <span>
          Use a one-time password setup link instead
          <span className="mt-1 block font-normal leading-5">
            Sign-in is disabled until the recipient sets a password. All current sessions are revoked.
          </span>
        </span>
      </label>
      {state.error && <p role="alert" className="text-xs font-medium text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="text-xs font-medium text-emerald-700">{state.success}</p>}
      {state.standardPassword && state.standardLoginIdentifier && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs leading-5 text-emerald-900">
          Sign-in number: <strong>{state.standardLoginIdentifier}</strong><br />
          Temporary password: <strong>{state.standardPassword}</strong><br />
          Share these securely. The recipient must change the password at first sign-in.
        </p>
      )}
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
