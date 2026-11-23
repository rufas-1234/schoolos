"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSignedInWorkspacePath } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [emailCodeMode, setEmailCodeMode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeEmail, setCodeEmail] = useState("");

  async function finishSignIn() {
    try {
      const destination = await getSignedInWorkspacePath();
      router.replace(destination);
      router.refresh();
    } catch {
      setError("You are signed in, but your school workspace could not be loaded. Refresh or contact your administrator.");
    }
  }

  async function handlePasswordSubmit(formData: FormData) {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/identifier/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: String(formData.get("identifier") ?? ""),
          password: String(formData.get("password") ?? ""),
        }),
      });
      if (!response.ok) {
        setError("Sign-in failed. Check your credentials or contact your administrator.");
        return;
      }
      await finishSignIn();
    } catch {
      setError("Sign-in failed. Check your credentials or contact your administrator.");
    } finally {
      setPending(false);
    }
  }

  async function handleSendCode(formData: FormData) {
    setPending(true);
    setError("");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    try {
      const response = await fetch("/api/auth/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setError(result?.error ?? "The sign-in code could not be sent. Try again in a moment.");
        return;
      }
      setCodeEmail(email);
      setCodeSent(true);
    } catch {
      setError("The sign-in code could not be sent. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleVerifyCode(formData: FormData) {
    setPending(true);
    setError("");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const token = String(formData.get("token") ?? "").trim();

    try {
      const response = await fetch("/api/auth/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, token }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setError(result?.error ?? "That code is invalid or expired. Request a new code and try again.");
        return;
      }
      await finishSignIn();
    } catch {
      setError("That code could not be verified. Request a new code and try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleGoogleSignIn() {
    const email = (emailRef.current?.value || codeEmail).trim().toLowerCase();
    if (!email.includes("@")) {
      setError("Enter your SchoolOS account email first, then continue with Google.");
      return;
    }

    setPending(true);
    setError("");
    try {
      const eligibility = await fetch("/api/auth/google/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!eligibility.ok) {
        const result = await eligibility.json().catch(() => null) as { error?: string } | null;
        setError(result?.error ?? "Google sign-in is unavailable for this account.");
        return;
      }

      const { error: oauthError } = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { login_hint: email },
        },
      });
      if (oauthError) setError("Google sign-in could not start. Check that Google is enabled in Supabase Auth.");
    } catch {
      setError("Google sign-in could not start. Check your connection and Supabase Auth settings.");
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
      {reason === "account-not-found" && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          This Google account is not linked to an active SchoolOS account. Check the email or contact your administrator.
        </p>
      )}
      {reason === "oauth-failed" && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Google sign-in could not be completed. Try again or use an email sign-in option.
        </p>
      )}
      {reason === "reset-link-expired" && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          That password reset link is invalid or expired. Request a new one and try again.
        </p>
      )}
      {error && (
        <p id="login-error" role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {emailCodeMode ? (
        codeSent ? (
          <form action={handleVerifyCode} className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">Enter the sign-in code sent to your email address.</p>
            <input type="hidden" name="email" value={codeEmail} />
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Email code</span>
              <input
                autoComplete="one-time-code"
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-lg tracking-[0.35em] outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                name="token"
                inputMode="numeric"
                maxLength={10}
                pattern="[0-9]{6,10}"
                placeholder="000000"
                required
                type="text"
              />
            </label>
            <Button className="h-12 w-full rounded-xl" disabled={pending} type="submit">
              {pending ? "Checking code..." : "Verify code and sign in"}
            </Button>
            <button
              className="w-full text-sm font-medium text-violet-700 underline underline-offset-4"
              disabled={pending}
              onClick={() => setCodeSent(false)}
              type="button"
            >
              Send another code
            </button>
          </form>
        ) : (
          <form action={handleSendCode} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">SchoolOS email</span>
              <span className="relative block">
                <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoComplete="email"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                  name="email"
                  placeholder="you@school.org"
                  defaultValue={codeEmail}
                  ref={emailRef}
                  required
                  type="email"
                />
              </span>
            </label>
            <Button className="h-12 w-full rounded-xl" disabled={pending} type="submit">
              {pending ? "Sending code..." : "Email me a sign-in code"}
            </Button>
          </form>
        )
      ) : (
        <form action={handlePasswordSubmit} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Email, phone number, or admission number</span>
            <span className="relative block">
              <KeyRound size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoComplete="username"
                className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                name="identifier"
                placeholder="Email, phone, or admission number"
                defaultValue={codeEmail}
                ref={emailRef}
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
          <Button className="h-12 w-full rounded-xl" disabled={pending} type="submit">
            {pending ? "Signing in..." : "Sign in with password"}
          </Button>
        </form>
      )}

      <button
        className="w-full text-sm font-medium text-violet-700 underline underline-offset-4"
        disabled={pending}
        onClick={() => {
          setError("");
          const currentEmail = emailRef.current?.value.trim() ?? "";
          if (!emailCodeMode && currentEmail.includes("@")) setCodeEmail(currentEmail);
          setEmailCodeMode((current) => !current);
          setCodeSent(false);
        }}
        type="button"
      >
        {emailCodeMode ? "Use password instead" : "Email me a verification code instead"}
      </button>

      {!emailCodeMode && (
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="font-medium text-violet-700 underline underline-offset-4">
            Forgot password?
          </Link>
        </p>
      )}

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <Button className="h-12 w-full rounded-xl" disabled={pending} onClick={handleGoogleSignIn} type="button" variant="outline">
        <span aria-hidden="true" className="text-base font-bold text-blue-600">G</span>
        {pending ? "Connecting to Google..." : "Continue with Google"}
      </Button>
    </div>
  );
}
