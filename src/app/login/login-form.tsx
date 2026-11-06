"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError("");

    try {
      const result = await authClient.signIn.email({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      if (result.error) {
        setError("Sign-in failed. Check your credentials or contact your administrator.");
        return;
      }

      router.replace("/admin/dashboard");
      router.refresh();
    } catch {
      setError("Sign-in failed. Check your credentials or contact your administrator.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      action={handleSubmit}
      className="mt-8 space-y-5"
      aria-describedby={error ? "login-error" : undefined}
    >
      {searchParams.get("reason") === "account-disabled" && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          This account is inactive. Contact your school administrator.
        </p>
      )}
      {error && (
        <p id="login-error" role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Email address</span>
        <span className="relative block">
          <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            autoComplete="email"
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            name="email"
            placeholder="you@school.edu"
            required
            type="email"
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
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
