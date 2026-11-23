"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PasswordResetForm() {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: String(formData.get("password") ?? ""),
          confirmation: String(formData.get("confirmation") ?? ""),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "The password could not be updated. Try again.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("The password could not be updated. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="mt-7 space-y-4">
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
          Your password has been reset. You can now sign in with it.
        </p>
        <Link href="/select-school" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800">
          Continue to SchoolOS
        </Link>
      </div>
    );
  }

  return (
    <form action={submit} className="mt-7 space-y-4">
      <label className="block space-y-2 text-sm font-medium text-slate-700">
        New password
        <input type="password" name="password" autoComplete="new-password" minLength={6} maxLength={128} required className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
      </label>
      <label className="block space-y-2 text-sm font-medium text-slate-700">
        Confirm new password
        <input type="password" name="confirmation" autoComplete="new-password" minLength={6} maxLength={128} required className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
      </label>
      <p className="text-xs leading-5 text-slate-500">Use at least 6 characters, including uppercase and lowercase letters, a number, and a symbol.</p>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <Button type="submit" className="h-12 w-full" disabled={pending}>
        {pending ? "Updating password..." : "Set new password"}
      </Button>
    </form>
  );
}
