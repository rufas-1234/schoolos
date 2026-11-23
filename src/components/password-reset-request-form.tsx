"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PasswordResetRequestForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(formData.get("email") ?? "") }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) {
        setError(result.error ?? "Enter a valid email address.");
        return;
      }
      setMessage(result.message ?? "If an active SchoolOS account uses that email, a reset message will be sent.");
    } catch {
      setError("The reset request could not be sent. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={submit} className="mt-7 space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Enter the email address on your SchoolOS account. If it is active, we’ll send a password reset link.
      </p>
      <label className="block space-y-2 text-sm font-medium text-slate-700">
        Account email
        <input
          type="email"
          name="email"
          autoComplete="email"
          maxLength={320}
          required
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          placeholder="you@school.org"
        />
      </label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">{message}</p>}
      <Button type="submit" className="h-12 w-full" disabled={pending}>
        {pending ? "Sending reset link..." : "Send password reset link"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-violet-700 underline underline-offset-4">Back to sign in</Link>
      </p>
    </form>
  );
}
