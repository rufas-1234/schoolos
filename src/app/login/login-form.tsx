"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSignedInWorkspacePath } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [redirectTo, setRedirectTo] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!redirectTo) return;
    const timer = window.setTimeout(() => router.replace(redirectTo), 650);
    return () => window.clearTimeout(timer);
  }, [redirectTo, router]);

  async function finishSignIn() {
    try {
      const destination = await getSignedInWorkspacePath();
      setSuccess("Sign in successful. Opening your account…");
      setRedirectTo(destination);
    } catch {
      setSuccess("");
      setError("Sign in succeeded, but your account could not be opened. Try signing in again or contact your school administrator.");
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setSuccess("");
    setRedirectTo("");

    try {
      const response = await fetch("/api/auth/identifier/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: String(formData.get("identifier") ?? ""),
          password: String(formData.get("password") ?? ""),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const result = payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as { success?: unknown; message?: unknown; error?: unknown }
        : {};
      if (!response.ok) {
        const message = typeof result.message === "string"
          ? result.message
          : typeof result.error === "string"
            ? result.error
            : "Sign-in failed. Check your credentials and try again.";
        setError(message);
        return;
      }
      if (result.success !== true) {
        setError("Sign-in could not be completed. Check your credentials and try again.");
        return;
      }
      await finishSignIn();
    } catch {
      setError("Sign-in failed. Check your connection and details, then try again.");
    } finally {
      setPending(false);
    }
  }

  const reason = searchParams.get("reason");

  return (
    <div className="mt-8 space-y-5" aria-describedby={error ? "login-error" : undefined}>
      {reason === "account-disabled" && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          This account is inactive. Contact your school administrator.
        </p>
      )}
      {reason === "reset-link-expired" && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          That password reset link is invalid or expired. Request a new one and try again.
        </p>
      )}
      {reason === "workspace-unavailable" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your password was updated, but your workspace could not be opened automatically. Sign in with your new password to continue.
        </p>
      )}
      {reason === "first-login-setup-incomplete" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your password was changed, but account setup did not finish. Sign in with your new password to continue setup.
        </p>
      )}
      {error && (
        <p id="login-error" role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}

      <form onSubmit={handlePasswordSubmit} className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Email, phone number, admission number, or staff number</span>
          <span className="relative block">
            <KeyRound size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoComplete="username"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              name="identifier"
              placeholder="Email, phone, admission number, or staff number"
              required
              type="text"
            />
          </span>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
          <span className="relative block">
            <LockKeyhole size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              name="password"
              placeholder="Enter your password"
              required
              type="password"
            />
          </span>
        </label>
        <Button className="h-12 w-full rounded-xl" disabled={pending || Boolean(redirectTo)} type="submit">
          {pending ? "Signing in..." : redirectTo ? "Opening your account..." : "Sign in with password"}
        </Button>
      </form>

      <p className="text-center text-sm">
        <Link href="/forgot-password" className="font-medium text-violet-700 underline underline-offset-4">
          Forgot password?
        </Link>
      </p>

    </div>
  );
}
