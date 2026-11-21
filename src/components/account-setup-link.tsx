"use client";

import { useState } from "react";

export function AccountSetupLink({ url }: { url: string }) {
  const [copyError, setCopyError] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopied(false);
      setCopyError("Clipboard access was denied. Select and copy the link manually.");
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">One-time password setup link</p>
      <p className="text-xs leading-5">
        Share this link privately with the recipient. It expires in 24 hours and can be used once.
        The recipient must choose a password before sign-in is enabled.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="One-time password setup link"
          readOnly
          value={url}
          className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2.5 py-2 text-xs text-slate-800"
        />
        <button
          type="button"
          onClick={copyLink}
          className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {copyError && <p role="alert" className="text-xs text-rose-700">{copyError}</p>}
    </div>
  );
}
