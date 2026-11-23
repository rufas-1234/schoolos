"use client";

import { useState } from "react";

export function AccountTemporaryPassword({
  password,
  username,
  accountType = "student",
}: {
  password: string;
  username?: string;
  accountType?: "student" | "staff";
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopied(false);
      setCopyError("Clipboard access was denied. Select and copy the password manually.");
    }
  }

  return (
    <section aria-label={`${accountType === "staff" ? "Staff" : "Student"} temporary password`} className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <h3 className="font-semibold">{accountType === "staff" ? "Staff" : "Student"} temporary password</h3>
      <p className="text-xs leading-5">
        Share this password privately with the {accountType === "staff" ? "staff member" : "student"}. It is shown only now and must be changed after first sign-in.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {username && (
          <input
            aria-label={accountType === "staff" ? "Staff number" : "Student admission number"}
            readOnly
            value={username}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
          />
        )}
        <input
          aria-label={`Temporary ${accountType} password`}
          readOnly
          value={password}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
        />
        <button
          type="button"
          onClick={copyPassword}
          className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
        >
          {copied ? "Copied" : "Copy password"}
        </button>
      </div>
      {copyError && <p role="alert" className="text-xs text-rose-700">{copyError}</p>}
    </section>
  );
}
